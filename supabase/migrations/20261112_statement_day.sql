-- =====================================================================
-- 信用卡結帳日（需求 3.2）
--   accounts 加 statement_day：每月幾日結帳（1～31；小月取月底）。null＝未設定。只有信用卡帳戶可以有。
--   account_balances view 多回傳 statement_day（加在最後一欄，create or replace 才能沿用原 view）。
--   可重複執行；不動既有資料。
-- =====================================================================
alter table public.accounts add column if not exists statement_day smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_statement_day_range') then
    alter table public.accounts add constraint accounts_statement_day_range
      check (statement_day is null or statement_day between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'accounts_statement_day_credit_card') then
    alter table public.accounts add constraint accounts_statement_day_credit_card
      check (statement_day is null or type = 'credit_card');
  end if;
end $$;

create or replace view public.account_balances
with (security_invoker = true) as
select a.id,
       a.user_id,
       a.name,
       a.type,
       a.currency,
       a.is_active,
       a.sort_order,
       a.initial_balance,
       a.initial_balance + coalesce(o.delta, 0) + coalesce(i.delta, 0) as balance,
       coalesce(o.pending_count, 0)             as pending_count,
       coalesce(o.pending_unestimated_count, 0) as pending_unestimated_count,
       coalesce(o.txn_count, 0) + coalesce(i.txn_count, 0) as txn_count,
       (select count(*)::int from public.recurring_rules rr where rr.account_id = a.id) as rule_count,
       a.statement_day
  from public.accounts a
  left join lateral (
    select sum(case t.type
                 when 'income'   then  t.counted_amount
                 when 'expense'  then -t.counted_amount
                 when 'transfer' then -t.amount
               end)::bigint as delta,
           (count(*) filter (where t.is_pending))::int as pending_count,
           (count(*) filter (where t.is_pending and t.estimated_amount is null))::int as pending_unestimated_count,
           count(*)::int as txn_count
      from public.transactions t
     where t.account_id = a.id
  ) o on true
  left join lateral (
    select sum(t.to_amount)::bigint as delta,
           count(*)::int as txn_count
      from public.transactions t
     where t.to_account_id = a.id
  ) i on true;
