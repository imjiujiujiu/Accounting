-- 固定收支支援拆帳（需求 3.10；使用者 2026-11-24 提出、2026-11-26 grill-me 定案）
--   例：Spotify $268＋卡片手續費 $4 每月同一筆（信用卡帳單上是一筆）。
--   1. 新表 recurring_rule_lines：規則的拆帳各行（分類、金額、行備註）。有 2 行以上＝拆帳規則；
--      此時 recurring_rules.category_id＝第一行的分類、amount＝總額，只能是支出（同交易的拆帳：只限主幣別帳戶）。
--   2. 每期產生「一筆拆帳交易」：各行共用一個 split_id，每一行都記 recurring_rule_id／occurrence_date。
--      原本 transactions (recurring_rule_id, occurrence_date) 的唯一限制改成只限一般交易（split_id is null）；
--      拆帳那一期是否已產生，在規則鎖住（for update）的情況下用 exists 判斷。
--   3. save_recurring_rule 多收 p_rule.lines：[{ category_id, amount, note }]（不到 2 行＝一般規則，清掉舊的各行）。
--   4. 分類搬移（刪除分類、第一次拆開大分類、收回單層）也搬規則的各行；刪除分類時，用到它的拆帳規則也加上同名標籤。
--   5. recurring_rule_list 最後多 lines（jsonb 陣列，依 position）；category_usage.rule_count 也算各行用到的規則。
--   6. save_split：同一筆拆帳裡有任何一行來自固定收支時，其他行（例：編輯時新增的一行）也補上同樣的關聯。
-- 可重複執行。

-- 1. 規則的拆帳各行 -----------------------------------------------------------
create table if not exists public.recurring_rule_lines (
  id            uuid primary key default gen_random_uuid(),
  rule_id       uuid not null,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position      smallint not null,
  category_id   uuid not null,
  category_kind text generated always as ('expense') stored,
  amount        bigint not null check (amount > 0),
  note          text not null default '',
  unique (rule_id, position),
  foreign key (rule_id, user_id) references public.recurring_rules (id, user_id) on delete cascade,
  foreign key (category_id, user_id, category_kind) references public.categories (id, user_id, kind)
);
create index if not exists recurring_rule_lines_category_idx on public.recurring_rule_lines (user_id, category_id);

alter table public.recurring_rule_lines enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'own_recurring_rule_lines') then
    create policy own_recurring_rule_lines on public.recurring_rule_lines
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'recurring_rule_lines_leaf_category' and tgrelid = 'public.recurring_rule_lines'::regclass
  ) then
    create trigger recurring_rule_lines_leaf_category
    before insert or update of category_id on public.recurring_rule_lines
    for each row execute function public.require_leaf_category();
  end if;
end;
$$;
revoke all on public.recurring_rule_lines from anon, authenticated;
-- 寫入請走 save_recurring_rule（以呼叫者身分寫入，所以需要 insert／delete）
grant select, insert, update, delete on public.recurring_rule_lines to authenticated;


-- 2. 同一期只產生一次：一般交易照舊用唯一限制；拆帳由產生函式自己檢查 -----------
alter table public.transactions drop constraint if exists transactions_recurring_occurrence_uniq;
drop index if exists public.transactions_recurring_occurrence_uniq;
create unique index transactions_recurring_occurrence_uniq
  on public.transactions (recurring_rule_id, occurrence_date) where split_id is null;
create index if not exists transactions_recurring_rule_idx
  on public.transactions (recurring_rule_id) where recurring_rule_id is not null;


-- 3. 產生函式（同 20261023_recurring_rules.sql，多了拆帳規則） -----------------
create or replace function public.generate_recurring_for(p_user_id uuid, p_today date default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Taipei')::date);
  r       public.recurring_rules;
  v_txn   uuid;
  v_split uuid;
  v_date  date;
  v_base  timestamptz;
  v_n     int := 0;
  v_loop  int;
begin
  perform set_config('app.recurring_generating', 'on', true);

  for r in
    select * from public.recurring_rules
     where user_id = p_user_id
       and next_date is not null
       and next_date <= v_today + 3          -- 遇週末提前最多 2 天
     order by id
     for update
  loop
    v_loop := 0;
    while not public.rule_is_finished(r)
          and public.adjust_weekend(r.next_date, r.weekend_adjust) <= v_today
          and v_loop < 5000 loop
      v_loop := v_loop + 1;
      v_date := public.adjust_weekend(r.next_date, r.weekend_adjust);

      if (select count(*) from public.recurring_rule_lines l where l.rule_id = r.id) > 1 then
        -- 拆帳規則：一筆拆帳交易（各行共用 split_id；行的順序＝created_at）
        if not exists (
          select 1 from public.transactions t
           where t.recurring_rule_id = r.id and t.occurrence_date = r.next_date
        ) then
          v_split := gen_random_uuid();
          v_base  := clock_timestamp();
          insert into public.transactions (
            id, user_id, date, type, account_id, category_id, amount, note, line_note, split_id,
            recurring_rule_id, occurrence_date, created_at
          )
          select gen_random_uuid(), r.user_id, v_date, 'expense', r.account_id, l.category_id, l.amount, r.note, l.note,
                 v_split, r.id, r.next_date, v_base + make_interval(secs => l.position / 1000000.0)
            from public.recurring_rule_lines l
           where l.rule_id = r.id
           order by l.position;

          insert into public.transaction_tags (transaction_id, tag_id, user_id)
          select t.id, rt.tag_id, r.user_id
            from public.transactions t
            join public.recurring_rule_tags rt on rt.rule_id = r.id
           where t.split_id = v_split;
          v_n := v_n + 1;
        end if;
      else
        v_txn := gen_random_uuid();
        insert into public.transactions (
          id, user_id, date, type, account_id, category_id, amount, note,
          recurring_rule_id, occurrence_date
        ) values (
          v_txn, r.user_id, v_date, r.type,
          r.account_id, r.category_id, r.amount, r.note,
          r.id, r.next_date
        )
        on conflict (recurring_rule_id, occurrence_date) where split_id is null do nothing;

        if found then
          insert into public.transaction_tags (transaction_id, tag_id, user_id)
          select v_txn, rt.tag_id, r.user_id
            from public.recurring_rule_tags rt
           where rt.rule_id = r.id;
          v_n := v_n + 1;
        end if;
      end if;

      r.generated_count := r.generated_count + 1;
      r.last_date       := r.next_date;
      r.next_date       := public.rule_next_occurrence(r, r.next_date + 1);
    end loop;

    if v_loop > 0 then
      update public.recurring_rules
         set generated_count = r.generated_count,
             last_date       = r.last_date,
             next_date       = r.next_date
       where id = r.id;
    end if;
  end loop;

  perform set_config('app.recurring_generating', '', true);
  return v_n;
end;
$$;
revoke execute on function public.generate_recurring_for(uuid, date) from public, anon, authenticated;


-- 4. 儲存規則（同 20261023_recurring_rules.sql，多了 p_rule.lines） ------------
--   lines：[{ category_id, amount, note }]，2 行以上＝拆帳規則（category_id＝第一行、amount＝總額，只能是支出、主幣別帳戶）
create or replace function public.save_recurring_rule(p_rule jsonb, p_tag_names text[] default '{}')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id      uuid := coalesce((p_rule ->> 'id')::uuid, gen_random_uuid());
  v_tag     text;
  v_tag_ids uuid[] := '{}';
  v_wd      smallint[];
  v_lines   jsonb := case when jsonb_typeof(p_rule -> 'lines') = 'array' then p_rule -> 'lines' else '[]'::jsonb end;
  v_split   boolean;
  v_cat     uuid := (p_rule ->> 'category_id')::uuid;
  v_amount  bigint := (p_rule ->> 'amount')::bigint;
  v_acc_cur text;
  v_main    text;
begin
  if jsonb_typeof(p_rule -> 'weekdays') = 'array' then
    select array_agg(distinct x::smallint order by x::smallint) into v_wd
      from jsonb_array_elements_text(p_rule -> 'weekdays') as x;
  end if;

  v_split := jsonb_array_length(v_lines) > 1;
  if v_split then
    if p_rule ->> 'type' is distinct from 'expense' then
      raise exception '只有支出可以拆帳' using errcode = 'check_violation';
    end if;
    select a.currency into v_acc_cur from public.accounts a
     where a.id = (p_rule ->> 'account_id')::uuid and a.user_id = auth.uid();
    select coalesce((select s.base_currency from public.settings s where s.user_id = auth.uid()), 'TWD') into v_main;
    if v_acc_cur is distinct from v_main then
      raise exception '拆帳目前只支援台幣帳戶' using errcode = 'check_violation';
    end if;
    if exists (select 1 from jsonb_array_elements(v_lines) l
                where coalesce((l ->> 'amount')::bigint, 0) <= 0 or l ->> 'category_id' is null) then
      raise exception '拆帳的每一行都要有分類與金額' using errcode = 'check_violation';
    end if;
    v_cat    := (v_lines -> 0 ->> 'category_id')::uuid;
    v_amount := (select sum((l ->> 'amount')::bigint) from jsonb_array_elements(v_lines) l);
  end if;

  insert into public.recurring_rules as r (
    id, type, account_id, category_id, amount, note,
    freq, interval, weekdays, month_day, month_of_year, weekend_adjust,
    start_date, end_date, max_count
  ) values (
    v_id,
    p_rule ->> 'type',
    (p_rule ->> 'account_id')::uuid,
    v_cat,
    v_amount,
    coalesce(p_rule ->> 'note', ''),
    p_rule ->> 'freq',
    coalesce((p_rule ->> 'interval')::int, 1),
    v_wd,
    (p_rule ->> 'month_day')::smallint,
    (p_rule ->> 'month_of_year')::smallint,
    coalesce(p_rule ->> 'weekend_adjust', 'none'),
    (p_rule ->> 'start_date')::date,
    (p_rule ->> 'end_date')::date,
    (p_rule ->> 'max_count')::int
  )
  on conflict (id) do update set
    type           = excluded.type,
    account_id     = excluded.account_id,
    category_id    = excluded.category_id,
    amount         = excluded.amount,
    note           = excluded.note,
    freq           = excluded.freq,
    interval       = excluded.interval,
    weekdays       = excluded.weekdays,
    month_day      = excluded.month_day,
    month_of_year  = excluded.month_of_year,
    weekend_adjust = excluded.weekend_adjust,
    start_date     = excluded.start_date,
    end_date       = excluded.end_date,
    max_count      = excluded.max_count
  where r.user_id = auth.uid();

  if not found then
    raise exception '找不到這筆固定收支' using errcode = 'no_data_found';
  end if;

  -- 拆帳各行：整組換掉（不到 2 行＝一般規則）
  delete from public.recurring_rule_lines l where l.rule_id = v_id;
  if v_split then
    insert into public.recurring_rule_lines (rule_id, position, category_id, amount, note)
    select v_id, (x.ord - 1)::smallint, (x.l ->> 'category_id')::uuid, (x.l ->> 'amount')::bigint,
           btrim(coalesce(x.l ->> 'note', ''))
      from jsonb_array_elements(v_lines) with ordinality as x(l, ord);
  end if;

  foreach v_tag in array coalesce(p_tag_names, '{}') loop
    if trim(v_tag) <> '' then
      v_tag_ids := v_tag_ids || public.get_or_create_tag(v_tag);
    end if;
  end loop;

  delete from public.recurring_rule_tags
   where rule_id = v_id
     and not (tag_id = any (v_tag_ids));

  insert into public.recurring_rule_tags (rule_id, tag_id)
  select v_id, x from unnest(v_tag_ids) as x
  on conflict do nothing;

  perform public.generate_my_recurring();

  return v_id;
end;
$$;
revoke execute on function public.save_recurring_rule(jsonb, text[]) from public, anon;
grant execute on function public.save_recurring_rule(jsonb, text[]) to authenticated;


-- 5. 規則清單：最後多 lines ------------------------------------------------------
create or replace view public.recurring_rule_list
with (security_invoker = true) as
select r.*,
       public.rule_is_finished(r) as is_finished,
       case when public.rule_is_finished(r) then null
            else public.adjust_weekend(r.next_date, r.weekend_adjust) end as next_run_date,
       coalesce((select array_agg(rt.tag_id) from public.recurring_rule_tags rt where rt.rule_id = r.id), '{}') as tag_ids,
       coalesce((select jsonb_agg(jsonb_build_object('category_id', l.category_id, 'amount', l.amount, 'note', l.note)
                                  order by l.position)
                   from public.recurring_rule_lines l where l.rule_id = r.id), '[]'::jsonb) as lines
  from public.recurring_rules r;
grant select on public.recurring_rule_list to authenticated;


-- 6. 分類用量：規則數也算拆帳各行用到的 ------------------------------------------
create or replace view public.category_usage
with (security_invoker = true) as
select c.id,
       c.user_id,
       c.name,
       c.kind,
       c.is_active,
       c.sort_order,
       coalesce(u.txn_count, 0) as txn_count,
       (select count(*)::int from public.recurring_rules rr
         where rr.category_id = c.id
            or exists (select 1 from public.recurring_rule_lines l where l.rule_id = rr.id and l.category_id = c.id)) as rule_count,
       c.icon,
       c.parent_id,
       c.color
  from public.categories c
  left join lateral (
    select count(*)::int as txn_count
      from public.transactions t
     where t.category_id = c.id
  ) u on true;


-- 7. 結構檢查：有規則（含拆帳各行）用到的大分類不能直接掛小分類 -------------------
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
     or exists (select 1 from public.recurring_rules r where r.category_id = new.parent_id)
     or exists (select 1 from public.recurring_rule_lines l where l.category_id = new.parent_id) then
    raise exception '「%」還有交易，請透過管理頁新增小分類', v_parent.name using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


-- 8. 收回單層：規則的拆帳各行一起歸回大分類 ----------------------------------------
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
  update public.recurring_rule_lines l set category_id = p_parent_id
   where l.user_id = auth.uid() and l.category_id = v_other;
  delete from public.categories c where c.id = v_other;
  return true;
end;
$$;


-- 9. 新增／編輯分類：第一次拆開大分類時，規則的拆帳各行也移到「其他X」 --------------
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
      select count(*)::int into v_rules from public.recurring_rules r
       where r.user_id = auth.uid()
         and (r.category_id = v_parent.id
              or exists (select 1 from public.recurring_rule_lines l where l.rule_id = r.id and l.category_id = v_parent.id));
      update public.recurring_rule_lines l set category_id = v_other_id
       where l.user_id = auth.uid() and l.category_id = v_parent.id;
      update public.recurring_rules r set category_id = v_other_id
       where r.user_id = auth.uid() and r.category_id = v_parent.id;

      update public.categories c set parent_id = v_parent.id where c.id = v_other_id;

      if v_txns > 0 or v_rules > 0 then
        v_split := jsonb_build_object('other_id', v_other_id, 'other_name', v_other_name,
                                      'moved_txns', v_txns, 'moved_rules', v_rules);
      end if;
    end if;
  end if;

  if v_is_new then
    insert into public.categories (id, name, kind, parent_id, icon, color, sort_order)
    values (coalesce(v_id, gen_random_uuid()), v_name, v_kind, v_parent_id,
            nullif(p_category ->> 'icon', ''),
            nullif(p_category ->> 'color', ''),
            coalesce((p_category ->> 'sort_order')::int, 50))
    returning id into v_id;
  else
    update public.categories c
       set name       = v_name,
           parent_id  = v_parent_id,
           icon       = case when p_category ? 'icon' then nullif(p_category ->> 'icon', '') else c.icon end,
           color      = case when p_category ? 'color' then nullif(p_category ->> 'color', '') else c.color end,
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


-- 10. 刪除分類：規則的拆帳各行也改套「其他」／「其他X」，該規則加上同名標籤 -------------
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
     or exists (select 1 from public.recurring_rules r where r.user_id = auth.uid() and r.category_id = p_id)
     or exists (select 1 from public.recurring_rule_lines l where l.user_id = auth.uid() and l.category_id = p_id) then
    v_tag := public.get_or_create_tag(v_cat.name);

    insert into public.transaction_tags (transaction_id, tag_id)
    select t.id, v_tag from public.transactions t
     where t.user_id = auth.uid() and t.category_id = p_id
    on conflict do nothing;

    update public.transactions t set category_id = v_other
     where t.user_id = auth.uid() and t.category_id = p_id;
    get diagnostics v_txns = row_count;

    select count(*)::int into v_rules from public.recurring_rules r
     where r.user_id = auth.uid()
       and (r.category_id = p_id
            or exists (select 1 from public.recurring_rule_lines l where l.rule_id = r.id and l.category_id = p_id));

    insert into public.recurring_rule_tags (rule_id, tag_id)
    select r.id, v_tag from public.recurring_rules r
     where r.user_id = auth.uid()
       and (r.category_id = p_id
            or exists (select 1 from public.recurring_rule_lines l where l.rule_id = r.id and l.category_id = p_id))
    on conflict do nothing;

    update public.recurring_rule_lines l set category_id = v_other
     where l.user_id = auth.uid() and l.category_id = p_id;
    update public.recurring_rules r set category_id = v_other
     where r.user_id = auth.uid() and r.category_id = p_id;
  end if;

  delete from public.categories c where c.id = p_id;

  if v_cat.parent_id is not null then
    perform public.collapse_category(v_cat.parent_id);
  end if;

  return query select v_txns, v_rules;
end;
$$;


-- 11. 儲存拆帳：來自固定收支的拆帳，新增的行也補上關聯 ------------------------------------
create or replace function public.save_split(p_split jsonb, p_tag_names text[] default '{}')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_split   uuid := coalesce((p_split ->> 'id')::uuid, gen_random_uuid());
  v_lines   jsonb := coalesce(p_split -> 'lines', '[]'::jsonb);
  v_n       int := jsonb_array_length(coalesce(p_split -> 'lines', '[]'::jsonb));
  v_line    jsonb;
  v_ids     uuid[] := '{}';
  v_id      uuid;
  v_i       int := 0;
  v_base    timestamptz := clock_timestamp();
  v_acc_cur text;
  v_main    text;
begin
  if v_n < 1 then
    raise exception '拆帳至少要一行' using errcode = 'check_violation';
  end if;

  select a.currency into v_acc_cur from public.accounts a
   where a.id = (p_split ->> 'account_id')::uuid and a.user_id = auth.uid();
  select coalesce((select s.base_currency from public.settings s where s.user_id = auth.uid()), 'TWD') into v_main;
  if v_n > 1 and v_acc_cur is distinct from v_main then
    raise exception '拆帳目前只支援台幣帳戶' using errcode = 'check_violation';
  end if;

  -- 行 id 不能屬於別筆拆帳
  if exists (
    select 1 from jsonb_array_elements(v_lines) l
      join public.transactions t on t.id = (l ->> 'id')::uuid
     where t.split_id is not null and t.split_id <> v_split
  ) then
    raise exception '這一行屬於另一筆拆帳' using errcode = 'check_violation';
  end if;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_i := v_i + 1;
    v_id := coalesce((v_line ->> 'id')::uuid, gen_random_uuid());
    -- 新的一行：依序給 created_at，讓行的順序固定
    if not exists (select 1 from public.transactions t where t.id = v_id) then
      insert into public.transactions (id, date, type, account_id, category_id, amount, note, created_at)
      values (v_id, (p_split ->> 'date')::date, 'expense', (p_split ->> 'account_id')::uuid,
              (v_line ->> 'category_id')::uuid, (v_line ->> 'amount')::bigint,
              coalesce(p_split ->> 'note', ''), v_base + make_interval(secs => v_i / 1000000.0));
    end if;
    perform public.save_transaction(
      jsonb_build_object(
        'id', v_id,
        'date', p_split ->> 'date',
        'type', 'expense',
        'account_id', p_split ->> 'account_id',
        'category_id', v_line ->> 'category_id',
        'amount', v_line ->> 'amount',
        'note', coalesce(p_split ->> 'note', '')
      ),
      p_tag_names
    );
    -- 行備註：取消拆帳（只剩一行）時清空
    update public.transactions t
       set line_note = case when v_n > 1 then btrim(coalesce(v_line ->> 'note', '')) else '' end
     where t.id = v_id and t.user_id = auth.uid()
       and t.line_note is distinct from case when v_n > 1 then btrim(coalesce(v_line ->> 'note', '')) else '' end;
    v_ids := v_ids || v_id;
  end loop;

  delete from public.transactions t
   where t.split_id = v_split and t.user_id = auth.uid() and not (t.id = any (v_ids));

  if v_n = 1 then
    update public.transactions t set split_id = null
     where t.id = v_ids[1] and t.user_id = auth.uid() and t.split_id is not null;
    return null;
  end if;

  update public.transactions t set split_id = v_split
   where t.id = any (v_ids) and t.user_id = auth.uid() and t.split_id is distinct from v_split;

  -- 來自固定收支的拆帳：新增的行也補上同樣的關聯（清單不論顯示哪一行都有重複小圖示）
  update public.transactions t
     set recurring_rule_id = s.recurring_rule_id, occurrence_date = s.occurrence_date
    from (select x.recurring_rule_id, x.occurrence_date from public.transactions x
           where x.split_id = v_split and x.user_id = auth.uid() and x.recurring_rule_id is not null
           limit 1) s
   where t.split_id = v_split and t.user_id = auth.uid() and t.recurring_rule_id is null;
  return v_split;
end;
$$;
revoke execute on function public.save_split(jsonb, text[]) from public, anon;
grant execute on function public.save_split(jsonb, text[]) to authenticated;
