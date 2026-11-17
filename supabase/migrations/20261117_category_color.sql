-- 分類顏色（2026-11-17，統計批次第一步）
--   categories.color：#RRGGBB；null＝依名稱／順序自動配色（前端 src/lib/logic/categoryColors.js）
--   只有大分類使用；小分類一律沿用大分類的顏色（欄位保留，換組回大分類時仍可用）
--   category_usage 最後多回傳 color；save_category 可寫入 color（有給才改）
--   可重複執行

alter table public.categories add column if not exists color text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_color_format') then
    alter table public.categories
      add constraint categories_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

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
       c.parent_id,
       c.color
  from public.categories c
  left join lateral (
    select count(*)::int as txn_count
      from public.transactions t
     where t.category_id = c.id
  ) u on true;


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
