-- 旅程總覽：篩選單一標籤時，把這趟所有支出換算成主幣別（台幣）合計
--   只算支出；轉帳不計
--   主幣別帳戶（含外幣刷卡）：用計入金額（已回壓＝實際台幣＋手續費；預估中＝預估台幣；沒有預估值不計入）
--   外幣帳戶（外幣現金錢包）：依「這趟的換錢」匯率換算
--     ＝帶同一個標籤、從主幣別帳戶轉入該外幣帳戶的轉帳：Σ 轉出台幣 ÷ Σ 轉入外幣（加權平均）
--     這趟沒有換錢紀錄 → 改用設定頁的預設匯率；兩者都沒有 → converted 為 null（不計入）
--   換錢不受期間等篩選條件影響（出發前換的錢也算）
--   其餘篩選條件（期間、帳戶、分類、預估、關鍵字）與清單相同
--   每個幣別一列；rate 為每 1 單位外幣兌主幣別（主幣別本身為 1）
--   rate_source：'base' | 'exchange'（這趟換錢）| 'default'（預設匯率）| null（無法換算）
create or replace function public.summarize_trip(
  p_tag_id       uuid,
  p_from         date    default null,
  p_to           date    default null,
  p_account_id   uuid    default null,
  p_category_ids uuid[]  default null,
  p_pending_only boolean default false,
  p_keyword      text    default null
)
returns table (
  currency        text,
  expense         bigint,
  converted       bigint,
  rate            numeric,
  rate_source     text,
  estimated_count int,
  excluded_count  int
)
language sql stable
set search_path = ''
as $$
  with base as (
    select coalesce(
      (select s.base_currency from public.settings s where s.user_id = auth.uid()), 'TWD'
    ) as code
  ),
  e as (
    select a.currency as cur, t.counted_amount, t.is_pending, t.estimated_amount
      from public.filter_transactions(p_from, p_to, p_account_id, array['expense'], p_category_ids,
                                      array[p_tag_id], p_pending_only, p_keyword) t
      join public.accounts a on a.id = t.account_id
  ),
  g as (
    select e.cur,
           coalesce(sum(e.counted_amount), 0)::bigint                                       as expense,
           (count(*) filter (where e.is_pending and e.estimated_amount is not null))::int   as estimated_count,
           (count(*) filter (where e.is_pending and e.estimated_amount is null))::int       as excluded_count
      from e
     group by e.cur
  ),
  x as (
    select ta.currency as cur, sum(t.amount)::numeric as paid, sum(t.to_amount)::numeric as got
      from public.transactions t
      join public.transaction_tags tt on tt.transaction_id = t.id and tt.tag_id = p_tag_id
      join public.accounts fa on fa.id = t.account_id
      join public.accounts ta on ta.id = t.to_account_id
      cross join base b
     where t.user_id = auth.uid()
       and t.type = 'transfer'
       and fa.currency = b.code
       and ta.currency <> b.code
     group by ta.currency
  )
  select g.cur,
         g.expense,
         case
           when g.cur = b.code then g.expense
           when x.got > 0 then round(g.expense * x.paid / x.got)::bigint
           when r.rate is not null then round(r.rate * g.expense / power(10::numeric, cf.minor_unit) * power(10::numeric, cb.minor_unit))::bigint
         end,
         case
           when g.cur = b.code then 1::numeric
           when x.got > 0 then round(x.paid / x.got * power(10::numeric, cf.minor_unit) / power(10::numeric, cb.minor_unit), 4)
           else r.rate
         end,
         case
           when g.cur = b.code then 'base'
           when x.got > 0 then 'exchange'
           when r.rate is not null then 'default'
         end,
         g.estimated_count,
         g.excluded_count
    from g
   cross join base b
    left join x on x.cur = g.cur
    left join public.default_rates r on r.user_id = auth.uid() and r.currency = g.cur
    left join public.currencies cf on cf.code = g.cur
    left join public.currencies cb on cb.code = b.code
   order by (g.cur = b.code) desc, g.cur
$$;

revoke execute on function public.summarize_trip(uuid, date, date, uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.summarize_trip(uuid, date, date, uuid, uuid[], boolean, text) to authenticated;
