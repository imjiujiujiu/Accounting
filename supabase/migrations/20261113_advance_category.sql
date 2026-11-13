-- 代墊改為分類（2026-11-13，見專案文件 claude/advance-and-split.md）
--   「代墊」以分類名稱辨認（支出、收入各一個），不加資料庫欄位。
--   什麼時候算進收支：
--     - 選了單一帳戶（p_account_id 有值）→ 算：照實反映帳戶進出，信用卡對帳金額才對
--     - 分類篩選只選了「代墊」→ 算：支出＝墊出去的、收入＝收回的
--     - 其他（「全部帳戶」）→ 不算：收入、支出、分類加總、旅程合計都不含
--   清單（filter_transactions）不變：代墊交易照常列出，只是不計入合計。
--   可重複執行。

create or replace function public.is_advance_name(p_name text)
returns boolean
language sql immutable
set search_path = ''
as $$ select coalesce(trim(p_name) = '代墊', false) $$;

create or replace function public.advance_counted(p_account_id uuid, p_category_ids uuid[])
returns boolean
language sql stable
set search_path = ''
as $$
  select p_account_id is not null
      or (coalesce(cardinality(p_category_ids), 0) > 0
          and not exists (
            select 1 from unnest(p_category_ids) as x(id)
              left join public.categories c on c.id = x.id and c.user_id = auth.uid()
             where not public.is_advance_name(c.name)))
$$;

revoke execute on function public.is_advance_name(text) from public, anon;
revoke execute on function public.advance_counted(uuid, uuid[]) from public, anon;
grant execute on function public.is_advance_name(text) to authenticated;
grant execute on function public.advance_counted(uuid, uuid[]) to authenticated;

create or replace function public.summarize_transactions(
  p_from         date    default null,
  p_to           date    default null,
  p_account_id   uuid    default null,
  p_types        text[]  default null,
  p_category_ids uuid[]  default null,
  p_tag_ids      uuid[]  default null,
  p_pending_only boolean default false,
  p_keyword      text    default null
)
returns table (
  currency        text,
  income          bigint,
  expense         bigint,
  net             bigint,
  estimated_count int,
  excluded_count  int
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
  ),
  f as (
    select t.type, t.counted_amount, t.is_pending, t.estimated_amount
      from public.filter_transactions(p_from, p_to, p_account_id, p_types, p_category_ids,
                                      p_tag_ids, p_pending_only, p_keyword) t
      join public.accounts a on a.id = t.account_id
      join scope sc on sc.currency = a.currency
      left join public.categories c on c.id = t.category_id
     where t.type <> 'transfer'
       and (public.advance_counted(p_account_id, p_category_ids) or not public.is_advance_name(c.name))
  ),
  s as (
    select coalesce(sum(counted_amount) filter (where type = 'income'), 0)::bigint  as income,
           coalesce(sum(counted_amount) filter (where type = 'expense'), 0)::bigint as expense,
           (count(*) filter (where is_pending and estimated_amount is not null))::int as estimated_count,
           (count(*) filter (where is_pending and estimated_amount is null))::int     as excluded_count
      from f
  )
  select sc.currency, s.income, s.expense, s.income - s.expense, s.estimated_count, s.excluded_count
    from scope sc cross join s
$$;

create or replace function public.summarize_by_category(
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
  category_id     uuid,
  total           bigint,
  txn_count       int,
  estimated_count int
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
  select t.category_id,
         coalesce(sum(t.counted_amount), 0)::bigint,
         count(*)::int,
         (count(*) filter (where t.is_pending and t.estimated_amount is not null))::int
    from public.filter_transactions(p_from, p_to, p_account_id, array[p_kind], p_category_ids,
                                    p_tag_ids, p_pending_only, p_keyword) t
    join public.accounts a on a.id = t.account_id
    join scope sc on sc.currency = a.currency
    left join public.categories c on c.id = t.category_id
   where public.advance_counted(p_account_id, p_category_ids) or not public.is_advance_name(c.name)
   group by t.category_id
   order by 2 desc
$$;

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
      left join public.categories c on c.id = t.category_id
     where public.advance_counted(p_account_id, p_category_ids) or not public.is_advance_name(c.name)
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

revoke execute on function public.summarize_transactions(date, date, uuid, text[], uuid[], uuid[], boolean, text) from public, anon;
revoke execute on function public.summarize_by_category(date, date, uuid, text, uuid[], uuid[], boolean, text) from public, anon;
grant execute on function public.summarize_transactions(date, date, uuid, text[], uuid[], uuid[], boolean, text) to authenticated;
grant execute on function public.summarize_by_category(date, date, uuid, text, uuid[], uuid[], boolean, text)    to authenticated;
revoke execute on function public.summarize_trip(uuid, date, date, uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.summarize_trip(uuid, date, date, uuid, uuid[], boolean, text) to authenticated;
