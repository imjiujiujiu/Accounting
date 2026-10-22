-- =====================================================================
-- 2026-10-22 管理頁調整
-- 用法：Supabase 後台 → SQL Editor → 貼上全文 → Run（執行一次即可，可重複執行）
--
-- 1. 類別改為「沒有交易使用就能刪除」：開放刪除權限。
--    有交易使用的類別，刪除會被 transactions 的外鍵擋下（錯誤碼 23503），只能停用。
-- 2. 新增 category_usage view：每個類別被幾筆交易使用（0 才能刪除），管理頁用。
-- 3. 預設類別改為新列表（新帳號自動建立）：
--      支出：餐飲、交通、購物、居住、娛樂、醫療、學習、捐贈、投資、送禮、其他
--      收入：薪水、回饋、投資、其他
-- 4. 已建立的帳號：補上缺少的新預設類別、預設類別依新順序排列。
--    舊的「獎金」「投資收益」不會自動刪除，請到管理頁自行刪除（有交易使用的只能停用）。
-- =====================================================================


-- 1. 類別可刪除
grant delete on public.categories to authenticated;

drop policy if exists own_categories_delete on public.categories;
create policy own_categories_delete on public.categories
  for delete to authenticated using (user_id = (select auth.uid()));


-- 2. 類別使用次數
create or replace view public.category_usage
with (security_invoker = true) as
select c.id,
       c.user_id,
       c.name,
       c.kind,
       c.is_active,
       c.sort_order,
       coalesce(u.txn_count, 0) as txn_count  -- 0 才能刪除
  from public.categories c
  left join lateral (
    select count(*)::int as txn_count
      from public.transactions t
     where t.category_id = c.id
  ) u on true;

grant select on public.category_usage to authenticated;


-- 3. 新的預設類別
create or replace function public.seed_user_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.categories (user_id, name, kind, sort_order)
  select p_user_id, x.name, x.kind, x.ord
    from (values
      ('餐飲', 'expense', 1), ('交通', 'expense', 2), ('購物', 'expense', 3),
      ('居住', 'expense', 4), ('娛樂', 'expense', 5), ('醫療', 'expense', 6),
      ('學習', 'expense', 7), ('捐贈', 'expense', 8), ('投資', 'expense', 9),
      ('送禮', 'expense', 10), ('其他', 'expense', 99),
      ('薪水', 'income', 1), ('回饋', 'income', 2), ('投資', 'income', 3),
      ('其他', 'income', 99)
    ) as x (name, kind, ord)
  on conflict (user_id, kind, name) do nothing;
end;
$$;


-- 4. 已建立的帳號：補上新類別、預設類別依新順序排列
select public.seed_user_defaults(id) from auth.users;

update public.categories c
   set sort_order = x.ord
  from (values
    ('餐飲', 'expense', 1), ('交通', 'expense', 2), ('購物', 'expense', 3),
    ('居住', 'expense', 4), ('娛樂', 'expense', 5), ('醫療', 'expense', 6),
    ('學習', 'expense', 7), ('捐贈', 'expense', 8), ('投資', 'expense', 9),
    ('送禮', 'expense', 10), ('其他', 'expense', 99),
    ('薪水', 'income', 1), ('回饋', 'income', 2), ('投資', 'income', 3),
    ('其他', 'income', 99)
  ) as x (name, kind, ord)
 where c.name = x.name and c.kind = x.kind and c.sort_order <> x.ord;
