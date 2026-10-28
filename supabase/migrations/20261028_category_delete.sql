-- =====================================================================
-- 20261028 分類刪除改為完整規則（需求 3.3）
--   - 除了「其他」以外的分類都能刪除；使用中的交易與固定收支規則改套同收支的「其他」，
--     並加上與原分類同名的標籤（留下線索，之後仍可用標籤篩選）
--   - 「其他」不能刪除、不能改名
--   - 分類不再有停用：既有停用的分類全部恢復為啟用（is_active 欄位保留但不再使用）
-- 可重複執行
-- =====================================================================


-- 1. 刪除分類：搬移交易與規則 → 加標籤 → 刪除，同一個資料庫交易內完成
--    回傳搬了幾筆交易、幾條規則
create or replace function public.delete_category(p_id uuid)
returns table (moved_txns int, moved_rules int)
language plpgsql
set search_path = ''
as $$
declare
  v_cat   public.categories%rowtype;
  v_other uuid;
  v_tag   uuid;
  v_txns  int := 0;
  v_rules int := 0;
begin
  select * into v_cat
    from public.categories c
   where c.id = p_id and c.user_id = auth.uid()
     for update;
  if not found then
    raise exception '找不到這個分類' using errcode = 'no_data_found';
  end if;
  if v_cat.name = '其他' then
    raise exception '「其他」不能刪除' using errcode = 'check_violation';
  end if;

  -- 同收支的「其他」；萬一不存在就補建
  select c.id into v_other
    from public.categories c
   where c.user_id = auth.uid() and c.kind = v_cat.kind and c.name = '其他';
  if v_other is null then
    insert into public.categories (name, kind, sort_order) values ('其他', v_cat.kind, 99)
    returning id into v_other;
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

  return query select v_txns, v_rules;
end;
$$;


-- 2. 保護「其他」：使用者不能直接刪除或改名
--    （以呼叫者身分判斷；帳號刪除時的連帶刪除沒有 auth.uid()，不受影響）
create or replace function public.categories_protect_other()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.name = '其他' then
      raise exception '「其他」不能刪除' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.name = '其他' and new.name is distinct from old.name then
    raise exception '「其他」不能改名' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'categories_protect_other'
       and tgrelid = 'public.categories'::regclass
  ) then
    create trigger categories_protect_other
    before update or delete on public.categories
    for each row execute function public.categories_protect_other();
  end if;
end;
$$;


-- 3. 不再有停用的分類
update public.categories set is_active = true where not is_active;


-- 4. 權限
grant execute on function public.delete_category(uuid) to authenticated;
revoke execute on function public.delete_category(uuid)        from public, anon;
revoke execute on function public.categories_protect_other()   from public, anon, authenticated;
