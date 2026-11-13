-- =====================================================================
-- 20261113 兩層分類（需求 3.3）
--   - categories.parent_id：所屬大分類（null＝大分類）。只有兩層，大小分類同收支
--   - 交易與固定收支只能記在最底層（有小分類的大分類不能直接記帳）
--   - 名稱：沿用 unique (user_id, kind, name)，同一收支內大、小分類都不能重名
--   - 「其他X」（例：「其他餐飲」）：大分類拆開時自動建立，接收大分類原有的交易與固定收支；
--     還有其他小分類時不能刪、不能改名、不能換組；大分類改名時跟著改名
--   - save_category(p_category jsonb)：新增／編輯分類（含換組、拆分、收回）
--   - delete_category(p_id)：刪除小分類 → 移到「其他X」＋同名標籤；只剩「其他X」時收回單層
--   - recent_categories(p_kind, p_limit)：「最近使用」（依建立時間，不含固定收支產生的）
--   - category_usage 最後多回傳 parent_id
--   不動既有資料（目前沒有任何小分類）。可重複執行
-- =====================================================================


-- 1. 欄位與限制 ----------------------------------------------------------
alter table public.categories add column if not exists parent_id uuid;

do $$
begin
  -- 大小分類必須同一使用者、同收支；有小分類的大分類不能直接刪除（no action）
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_fk') then
    alter table public.categories add constraint categories_parent_fk
      foreign key (parent_id, user_id, kind) references public.categories (id, user_id, kind);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_not_self') then
    alter table public.categories add constraint categories_parent_not_self
      check (parent_id is null or parent_id <> id);
  end if;
end;
$$;

create index if not exists categories_parent_idx
  on public.categories (parent_id) where parent_id is not null;


-- 2. 共用小工具 ----------------------------------------------------------
-- 大分類 X 的收容小分類名稱：「其他X」
create or replace function public.category_other_name(p_parent_name text)
returns text
language sql
immutable
set search_path = ''
as $$ select '其他' || p_parent_name $$;

-- save_category／delete_category 執行中（交易內有效）：允許改所屬分類、刪除與改名「其他X」
create or replace function public.category_op_active()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('app.category_op', true), '') = 'on' $$;


-- 3. 結構檢查：只有兩層、改所屬分類只能透過 save_category -------------------
create or replace function public.categories_tree_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.categories%rowtype;
begin
  if new.parent_id is not distinct from (case when tg_op = 'UPDATE' then old.parent_id end) then
    return new;
  end if;

  if auth.uid() is not null and not public.category_op_active() then
    raise exception '請在管理頁設定所屬分類' using errcode = 'check_violation';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent from public.categories c where c.id = new.parent_id;
  if v_parent.parent_id is not null then
    raise exception '分類只有兩層：「%」已經是小分類', v_parent.name using errcode = 'check_violation';
  end if;
  if v_parent.name = '其他' then
    raise exception '「其他」不能有小分類' using errcode = 'check_violation';
  end if;
  if new.name = '其他' then
    raise exception '「其他」不能成為小分類' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.categories c where c.parent_id = new.id) then
    raise exception '「%」底下有小分類，不能成為小分類', new.name using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.transactions t where t.category_id = new.parent_id)
     or exists (select 1 from public.recurring_rules r where r.category_id = new.parent_id) then
    raise exception '「%」還有交易，請透過管理頁新增小分類', v_parent.name using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'categories_tree_guard' and tgrelid = 'public.categories'::regclass
  ) then
    create trigger categories_tree_guard
    before insert or update of parent_id on public.categories
    for each row execute function public.categories_tree_guard();
  end if;
end;
$$;


-- 4. 保護「其他」與「其他X」（取代 20261028 的版本） ----------------------
--    以呼叫者身分判斷；帳號刪除時的連帶刪除沒有 auth.uid()，不受影響
create or replace function public.categories_protect_other()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_name text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.name = '其他' and old.parent_id is null then
      raise exception '「其他」不能刪除' using errcode = 'check_violation';
    end if;
    -- 小分類的刪除要經過 delete_category（搬移交易、收回單層）
    if old.parent_id is not null and not public.category_op_active() then
      raise exception '請在管理頁刪除小分類' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.name = '其他' and old.parent_id is null and new.name is distinct from old.name then
    raise exception '「其他」不能改名' using errcode = 'check_violation';
  end if;
  if old.parent_id is not null and new.name is distinct from old.name and not public.category_op_active() then
    select c.name into v_parent_name from public.categories c where c.id = old.parent_id;
    if old.name = public.category_other_name(v_parent_name) then
      raise exception '「%」不能改名', old.name using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- 觸發器本身已由 20261028 建立（before update or delete）


-- 5. 大分類改名時，「其他X」跟著改名 ---------------------------------------
create or replace function public.categories_rename_other()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null and new.name is distinct from old.name then
    perform set_config('app.category_op', 'on', true);
    update public.categories c
       set name = public.category_other_name(new.name)
     where c.parent_id = new.id
       and c.name = public.category_other_name(old.name);
  end if;
  return null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'categories_rename_other' and tgrelid = 'public.categories'::regclass
  ) then
    create trigger categories_rename_other
    after update of name on public.categories
    for each row execute function public.categories_rename_other();
  end if;
end;
$$;


-- 6. 交易與固定收支只能用最底層的分類 --------------------------------------
create or replace function public.require_leaf_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.category_id is not null
     and exists (select 1 from public.categories c where c.parent_id = new.category_id) then
    select c.name into v_name from public.categories c where c.id = new.category_id;
    raise exception '「%」已有小分類，請選擇小分類', v_name using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'transactions_leaf_category' and tgrelid = 'public.transactions'::regclass
  ) then
    create trigger transactions_leaf_category
    before insert or update of category_id on public.transactions
    for each row execute function public.require_leaf_category();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'recurring_rules_leaf_category' and tgrelid = 'public.recurring_rules'::regclass
  ) then
    create trigger recurring_rules_leaf_category
    before insert or update of category_id on public.recurring_rules
    for each row execute function public.require_leaf_category();
  end if;
end;
$$;


-- 7. 收回單層：大分類只剩「其他X」時，交易與規則歸回大分類並刪除「其他X」 ------
--    回傳是否有收回（內部使用，不開放給前端）
create or replace function public.collapse_category(p_parent_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.categories%rowtype;
  v_other  uuid;
begin
  select * into v_parent from public.categories c
   where c.id = p_parent_id and c.user_id = auth.uid() for update;
  if not found or v_parent.parent_id is not null then
    return false;
  end if;
  -- 只剩一個小分類，且就是「其他X」
  if (select count(*) from public.categories c where c.parent_id = p_parent_id) <> 1 then
    return false;
  end if;
  select c.id into v_other from public.categories c
   where c.parent_id = p_parent_id and c.name = public.category_other_name(v_parent.name);
  if v_other is null then
    return false;
  end if;

  perform set_config('app.category_op', 'on', true);
  update public.categories c set parent_id = null where c.id = v_other;   -- 先讓大分類回到最底層
  update public.transactions t set category_id = p_parent_id
   where t.user_id = auth.uid() and t.category_id = v_other;
  update public.recurring_rules r set category_id = p_parent_id
   where r.user_id = auth.uid() and r.category_id = v_other;
  delete from public.categories c where c.id = v_other;
  return true;
end;
$$;


-- 8. 新增／編輯分類 --------------------------------------------------------
--   p_category：{ id?, name?, kind?（新增時必填）, parent_id?（有給才改；null＝大分類）, icon?, sort_order? }
--   沒有給的欄位維持原值（新增時 sort_order 預設 50）
--   回傳 jsonb：
--     id
--     split     { other_id, other_name, moved_txns, moved_rules }：這次拆開了一個有交易的大分類（否則 null）
--     collapsed { parent_id }：原本的大分類只剩「其他X」而收回單層（否則 null）
create or replace function public.save_category(p_category jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id         uuid := nullif(p_category ->> 'id', '')::uuid;
  v_cur        public.categories%rowtype;
  v_is_new     boolean;
  v_kind       text;
  v_name       text;
  v_parent_id  uuid;
  v_old_parent uuid;
  v_parent     public.categories%rowtype;
  v_old_name   text;
  v_other_id   uuid;
  v_other_name text;
  v_txns       int := 0;
  v_rules      int := 0;
  v_split      jsonb;
  v_collapsed  jsonb;
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.category_op', 'on', true);

  if v_id is not null then
    select * into v_cur from public.categories c
     where c.id = v_id and c.user_id = auth.uid() for update;
  end if;
  v_is_new := v_cur.id is null;

  if v_is_new then
    v_kind := p_category ->> 'kind';
    if v_kind is null or v_kind not in ('income', 'expense') then
      raise exception '請選擇收入或支出' using errcode = 'check_violation';
    end if;
    v_old_parent := null;
    v_parent_id := nullif(p_category ->> 'parent_id', '')::uuid;
  else
    v_kind := v_cur.kind;
    if p_category ? 'kind' and p_category ->> 'kind' is distinct from v_cur.kind then
      raise exception '分類建立後不能改收支' using errcode = 'check_violation';
    end if;
    v_old_parent := v_cur.parent_id;
    -- 「其他X」不能改名（還有其他小分類時才會存在）
    if v_cur.parent_id is not null and p_category ? 'name'
       and trim(p_category ->> 'name') is distinct from v_cur.name then
      select c.name into v_old_name from public.categories c where c.id = v_cur.parent_id;
      if v_cur.name = public.category_other_name(v_old_name) then
        raise exception '「%」不能改名', v_cur.name using errcode = 'check_violation';
      end if;
    end if;
    v_parent_id := case when p_category ? 'parent_id'
                        then nullif(p_category ->> 'parent_id', '')::uuid
                        else v_cur.parent_id end;
  end if;

  v_name := coalesce(nullif(trim(p_category ->> 'name'), ''), v_cur.name);
  if v_name is null then
    raise exception '請輸入名稱' using errcode = 'check_violation';
  end if;

  -- 換組（或新增在某個大分類底下）
  if v_parent_id is not null and v_parent_id is distinct from v_old_parent then
    select * into v_parent from public.categories c
     where c.id = v_parent_id and c.user_id = auth.uid() and c.kind = v_kind for update;
    if not found then
      raise exception '找不到所屬分類' using errcode = 'no_data_found';
    end if;
    if not v_is_new then
      -- 「其他X」在還有其他小分類時不能換組
      if v_old_parent is not null then
        select c.name into v_old_name from public.categories c where c.id = v_old_parent;
        if v_cur.name = public.category_other_name(v_old_name) then
          raise exception '「%」不能換組', v_cur.name using errcode = 'check_violation';
        end if;
      end if;
      if v_cur.name = '其他' and v_cur.parent_id is null then
        raise exception '「其他」不能成為小分類' using errcode = 'check_violation';
      end if;
    end if;

    -- 第一個小分類：先建「其他X」接收大分類原有的交易與固定收支
    if v_parent.parent_id is null and v_parent.name <> '其他'
       and not exists (select 1 from public.categories c where c.parent_id = v_parent.id) then
      v_other_name := public.category_other_name(v_parent.name);
      insert into public.categories (name, kind, sort_order, icon)
      values (v_other_name, v_kind, 99, v_parent.icon)
      returning id into v_other_id;

      update public.transactions t set category_id = v_other_id
       where t.user_id = auth.uid() and t.category_id = v_parent.id;
      get diagnostics v_txns = row_count;
      update public.recurring_rules r set category_id = v_other_id
       where r.user_id = auth.uid() and r.category_id = v_parent.id;
      get diagnostics v_rules = row_count;

      update public.categories c set parent_id = v_parent.id where c.id = v_other_id;

      if v_txns > 0 or v_rules > 0 then
        v_split := jsonb_build_object('other_id', v_other_id, 'other_name', v_other_name,
                                      'moved_txns', v_txns, 'moved_rules', v_rules);
      end if;
    end if;
  end if;

  if v_is_new then
    insert into public.categories (id, name, kind, parent_id, icon, sort_order)
    values (coalesce(v_id, gen_random_uuid()), v_name, v_kind, v_parent_id,
            nullif(p_category ->> 'icon', ''),
            coalesce((p_category ->> 'sort_order')::int, 50))
    returning id into v_id;
  else
    update public.categories c
       set name       = v_name,
           parent_id  = v_parent_id,
           icon       = case when p_category ? 'icon' then nullif(p_category ->> 'icon', '') else c.icon end,
           sort_order = coalesce((p_category ->> 'sort_order')::int, c.sort_order)
     where c.id = v_id;
  end if;

  -- 離開原本的大分類後，原大分類只剩「其他X」就收回
  if v_old_parent is not null and v_old_parent is distinct from v_parent_id then
    if public.collapse_category(v_old_parent) then
      v_collapsed := jsonb_build_object('parent_id', v_old_parent);
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'split', v_split, 'collapsed', v_collapsed);
end;
$$;


-- 9. 刪除分類（取代 20261028 的版本；回傳欄位不變） ------------------------
--   大分類（沒有小分類）：交易與規則改套同收支的「其他」＋同名標籤（同現行）
--   有小分類的大分類：不能刪除
--   小分類：改套同大分類的「其他X」＋同名標籤；之後只剩「其他X」就收回單層
create or replace function public.delete_category(p_id uuid)
returns table (moved_txns int, moved_rules int)
language plpgsql
set search_path = ''
as $$
declare
  v_cat    public.categories%rowtype;
  v_parent public.categories%rowtype;
  v_other  uuid;
  v_tag    uuid;
  v_txns   int := 0;
  v_rules  int := 0;
begin
  select * into v_cat
    from public.categories c
   where c.id = p_id and c.user_id = auth.uid()
     for update;
  if not found then
    raise exception '找不到這個分類' using errcode = 'no_data_found';
  end if;
  if v_cat.name = '其他' and v_cat.parent_id is null then
    raise exception '「其他」不能刪除' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.categories c where c.parent_id = p_id) then
    raise exception '「%」還有小分類，請先刪除小分類', v_cat.name using errcode = 'check_violation';
  end if;
  perform set_config('app.category_op', 'on', true);

  if v_cat.parent_id is null then
    -- 同收支的「其他」；萬一不存在就補建
    select c.id into v_other
      from public.categories c
     where c.user_id = auth.uid() and c.kind = v_cat.kind and c.name = '其他' and c.parent_id is null;
    if v_other is null then
      insert into public.categories (name, kind, sort_order) values ('其他', v_cat.kind, 99)
      returning id into v_other;
    end if;
  else
    select * into v_parent from public.categories c where c.id = v_cat.parent_id for update;
    if v_cat.name = public.category_other_name(v_parent.name) then
      raise exception '「%」不能刪除', v_cat.name using errcode = 'check_violation';
    end if;
    -- 同大分類的「其他X」；萬一不存在就補建
    select c.id into v_other
      from public.categories c
     where c.parent_id = v_parent.id and c.name = public.category_other_name(v_parent.name);
    if v_other is null then
      insert into public.categories (name, kind, sort_order, icon, parent_id)
      values (public.category_other_name(v_parent.name), v_cat.kind, 99, v_parent.icon, v_parent.id)
      returning id into v_other;
    end if;
  end if;

  if exists (select 1 from public.transactions t where t.user_id = auth.uid() and t.category_id = p_id)
     or exists (select 1 from public.recurring_rules r where r.user_id = auth.uid() and r.category_id = p_id) then
    v_tag := public.get_or_create_tag(v_cat.name);

    insert into public.transaction_tags (transaction_id, tag_id)
    select t.id, v_tag from public.transactions t
     where t.user_id = auth.uid() and t.category_id = p_id
    on conflict do nothing;

    update public.transactions t set category_id = v_other
     where t.user_id = auth.uid() and t.category_id = p_id;
    get diagnostics v_txns = row_count;

    insert into public.recurring_rule_tags (rule_id, tag_id)
    select r.id, v_tag from public.recurring_rules r
     where r.user_id = auth.uid() and r.category_id = p_id
    on conflict do nothing;

    update public.recurring_rules r set category_id = v_other
     where r.user_id = auth.uid() and r.category_id = p_id;
    get diagnostics v_rules = row_count;
  end if;

  delete from public.categories c where c.id = p_id;

  if v_cat.parent_id is not null then
    perform public.collapse_category(v_cat.parent_id);
  end if;

  return query select v_txns, v_rules;
end;
$$;


-- 10. 最近使用 -------------------------------------------------------------
--   依建立時間（記帳的時間）由新到舊，取不重複的分類；固定收支產生的交易（有 occurrence_date）不算
create or replace function public.recent_categories(p_kind text, p_limit int default 5)
returns table (category_id uuid, last_used_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select t.category_id, max(t.created_at) as last_used_at
    from public.transactions t
   where t.user_id = auth.uid()
     and t.type = p_kind
     and t.category_id is not null
     and t.occurrence_date is null
   group by t.category_id
   order by max(t.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 5), 20))
$$;


-- 11. category_usage 最後多回傳 parent_id（加在最後一欄，create or replace 才能沿用原 view）
create or replace view public.category_usage
with (security_invoker = true) as
select c.id,
       c.user_id,
       c.name,
       c.kind,
       c.is_active,
       c.sort_order,
       coalesce(u.txn_count, 0) as txn_count,
       (select count(*)::int from public.recurring_rules rr where rr.category_id = c.id) as rule_count,
       c.icon,
       c.parent_id
  from public.categories c
  left join lateral (
    select count(*)::int as txn_count
      from public.transactions t
     where t.category_id = c.id
  ) u on true;


-- 12. 權限 -----------------------------------------------------------------
grant execute on function public.save_category(jsonb)          to authenticated;
grant execute on function public.recent_categories(text, int)  to authenticated;
grant execute on function public.delete_category(uuid)         to authenticated;
grant execute on function public.category_other_name(text)     to authenticated;
grant execute on function public.category_op_active()          to authenticated;
revoke execute on function public.save_category(jsonb)          from public, anon;
revoke execute on function public.recent_categories(text, int)  from public, anon;
revoke execute on function public.delete_category(uuid)         from public, anon;
grant execute on function public.collapse_category(uuid)        to authenticated;   -- 由 save_category／delete_category 以呼叫者身分執行
revoke execute on function public.collapse_category(uuid)       from public, anon;
revoke execute on function public.categories_tree_guard()       from public, anon, authenticated;
revoke execute on function public.categories_protect_other()    from public, anon, authenticated;
revoke execute on function public.categories_rename_other()     from public, anon, authenticated;
revoke execute on function public.require_leaf_category()       from public, anon, authenticated;
