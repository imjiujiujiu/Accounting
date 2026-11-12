-- =====================================================================
-- 分類圖示自選（需求 3.3）
--   categories 加 icon：圖示代號（對應前端 src/lib/icons.js 的 key，例如 'pets'）。
--   null＝沒選，前端依分類名稱對應預設圖示。
--   category_usage view 多回傳 icon（加在最後一欄，create or replace 才能沿用原 view）。
--   可重複執行；不動既有資料。
-- =====================================================================
alter table public.categories add column if not exists icon text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_icon_format') then
    alter table public.categories add constraint categories_icon_format
      check (icon is null or icon ~ '^[A-Za-z0-9_]{1,40}$');
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
       c.icon
  from public.categories c
  left join lateral (
    select count(*)::int as txn_count
      from public.transactions t
     where t.category_id = c.id
  ) u on true;
