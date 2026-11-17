-- 統計頁（2026-11-17，統計批次第二、三步）
--   summarize_by_period：趨勢圖，依日／月／年加總（篩選條件與 summarize_by_category 相同）
--   summarize_by_tag   ：依標籤統計，每個標籤一列（一筆交易可有多個標籤，各列相加可能超過總額）
--   金額規則與 summarize_by_category 相同：只計目前範圍的幣別（全部帳戶＝主幣別）、預估以預估值計入、
--   代墊依 advance_counted 決定算不算。筆數以「筆」計：拆帳的各行算一筆。
--   只新增函式，不動資料；可重複執行

create or replace function public.summarize_by_period(
  p_from         date    default null,
  p_to           date    default null,
  p_account_id   uuid    default null,
  p_kind         text    default 'expense',
  p_category_ids uuid[]  default null,
  p_tag_ids      uuid[]  default null,
  p_pending_only boolean default false,
  p_keyword      text    default null,
  p_bucket       text    default 'day'
)
returns table (
  bucket    date,
  total     bigint,
  txn_count int
)
language sql stable
set search_path = ''
as $$
  with scope as (
    select coalesce(
      (select a.currency from public.accounts a where a.id = p_account_id),
      (select s.base_currency from public.settings s where s.user_id = auth.uid()),
      'TWD'
    ) as currency
  )
  select date_trunc(case when p_bucket in ('day', 'month', 'year') then p_bucket else 'day' end, t.date)::date,
         coalesce(sum(t.counted_amount), 0)::bigint,
         count(distinct coalesce(t.split_id, t.id))::int
    from public.filter_transactions(p_from, p_to, p_account_id, array[p_kind], p_category_ids,
                                    p_tag_ids, p_pending_only, p_keyword) t
    join public.accounts a on a.id = t.account_id
    join scope sc on sc.currency = a.currency
    left join public.categories c on c.id = t.category_id
   where public.advance_counted(p_account_id, p_category_ids) or not public.is_advance_name(c.name)
   group by 1
   order by 1
$$;

create or replace function public.summarize_by_tag(
  p_from         date    default null,
  p_to           date    default null,
  p_account_id   uuid    default null,
  p_kind         text    default 'expense',
  p_category_ids uuid[]  default null,
  p_tag_ids      uuid[]  default null,
  p_pending_only boolean default false,
  p_keyword      text    default null
)
returns table (
  tag_id    uuid,
  total     bigint,
  txn_count int
)
language sql stable
set search_path = ''
as $$
  with scope as (
    select coalesce(
      (select a.currency from public.accounts a where a.id = p_account_id),
      (select s.base_currency from public.settings s where s.user_id = auth.uid()),
      'TWD'
    ) as currency
  )
  select tt.tag_id,
         coalesce(sum(t.counted_amount), 0)::bigint,
         count(distinct coalesce(t.split_id, t.id))::int
    from public.filter_transactions(p_from, p_to, p_account_id, array[p_kind], p_category_ids,
                                    p_tag_ids, p_pending_only, p_keyword) t
    join public.transaction_tags tt on tt.transaction_id = t.id
    join public.accounts a on a.id = t.account_id
    join scope sc on sc.currency = a.currency
    left join public.categories c on c.id = t.category_id
   where public.advance_counted(p_account_id, p_category_ids) or not public.is_advance_name(c.name)
   group by tt.tag_id
   order by 2 desc
$$;

revoke execute on function public.summarize_by_period(date, date, uuid, text, uuid[], uuid[], boolean, text, text) from public, anon;
revoke execute on function public.summarize_by_tag(date, date, uuid, text, uuid[], uuid[], boolean, text) from public, anon;
grant execute on function public.summarize_by_period(date, date, uuid, text, uuid[], uuid[], boolean, text, text) to authenticated;
grant execute on function public.summarize_by_tag(date, date, uuid, text, uuid[], uuid[], boolean, text) to authenticated;
