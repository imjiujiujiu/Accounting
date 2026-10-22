-- 2026-10-22：「類別」篩選合併「類型」後，類別條件不套用在轉帳上
-- 用法：Supabase 後台 → SQL Editor → 貼上全文 → Run（只需執行一次；權限設定不受影響）
-- 沒執行時：同時勾「轉帳」與部分類別，清單裡的轉帳不會出現；其他情況不受影響

create or replace function public.filter_transactions(
  p_from         date    default null,
  p_to           date    default null,
  p_account_id   uuid    default null,
  p_types        text[]  default null,
  p_category_ids uuid[]  default null,
  p_tag_ids      uuid[]  default null,
  p_pending_only boolean default false,
  p_keyword      text    default null
)
returns setof public.transactions
language sql stable
set search_path = ''
as $$
  select t.*
    from public.transactions t
   where t.user_id = auth.uid()
     and (p_from is null or t.date >= p_from)
     and (p_to   is null or t.date <= p_to)
     and (p_account_id is null or t.account_id = p_account_id or t.to_account_id = p_account_id)
     and (coalesce(cardinality(p_types), 0) = 0        or t.type = any (p_types))
     and (coalesce(cardinality(p_category_ids), 0) = 0 or t.type = 'transfer' or t.category_id = any (p_category_ids))
     and (coalesce(cardinality(p_tag_ids), 0) = 0 or exists (
            select 1 from public.transaction_tags tt
             where tt.transaction_id = t.id and tt.tag_id = any (p_tag_ids)))
     and (not coalesce(p_pending_only, false) or t.is_pending)
     and (coalesce(p_keyword, '') = '' or t.note ilike
            '%' || replace(replace(replace(p_keyword, '\', '\\'), '%', '\%'), '_', '\_') || '%')
$$;
