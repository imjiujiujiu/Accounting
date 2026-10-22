-- 2026-10-23：固定收支（定期交易）
-- 用法：Supabase 後台 → SQL Editor → 貼上全文 → Run（只需執行一次）
-- 對應需求文件 3.10
--
-- 架構：
--   recurring_rules       規則（範本＋週期＋結束條件）
--   recurring_rule_tags   規則的標籤
--   transactions          加上 recurring_rule_id／occurrence_date，記住每筆是由哪條規則、哪一期產生
--
-- 產生方式（MVP：到日期當天才產生）：
--   - pg_cron 每天台北時間 00:05 執行 generate_recurring_all()
--   - 前端儲存規則用 save_recurring_rule()，儲存後立刻補產生到今天（表單日期是今天或過去時）
--   - 前端開啟網頁時可呼叫 generate_my_recurring() 補產生（排程失敗時的保險）
--
-- 規則：
--   - 只有收入、支出可以設定重複
--   - 每月／每年可選遇週末調整：none 不調整／before 提前到星期五／after 延後到星期一
--     交易日期＝調整後日期；occurrence_date＝原定日期（避免重複產生）
--   - 產生進度記在 next_date（下一期原定日期），只往前走：刪掉單筆不會再長回來
--   - 修改週期只影響之後；已產生過交易的規則不可改開始日
--   - 刪除規則：已產生的交易保留，成為一般交易（recurring_rule_id 設為 null）


-- ---------------------------------------------------------------------
-- 1. 規則表
-- ---------------------------------------------------------------------
create table if not exists public.recurring_rules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- 範本（與交易相同）
  type            text not null check (type in ('income', 'expense')),
  account_id      uuid not null,
  category_id     uuid not null,
  category_kind   text generated always as (type) stored,
  amount          bigint not null check (amount > 0),
  note            text not null default '',

  -- 週期
  --   daily   每 interval 天
  --   weekly  每 interval 週，星期幾由 weekdays 指定（1=星期一 … 7=星期日；平日＝{1,2,3,4,5}）
  --   monthly 每 interval 個月的 month_day 日（大於當月天數時為月底）
  --   yearly  每 interval 年的 month_of_year 月 month_day 日（2/29 遇平年為 2/28）
  --   間隔以 start_date 為起點計算
  freq            text not null check (freq in ('daily', 'weekly', 'monthly', 'yearly')),
  interval        int not null default 1 check (interval between 1 and 999),
  weekdays        smallint[],
  month_day       smallint check (month_day between 1 and 31),
  month_of_year   smallint check (month_of_year between 1 and 12),
  weekend_adjust  text not null default 'none' check (weekend_adjust in ('none', 'before', 'after')),

  -- 起訖
  start_date      date not null,
  end_date        date,                     -- 到這天為止（含）
  max_count       int check (max_count > 0),-- 重複 N 次

  -- 產生進度（由資料庫維護，前端唯讀）
  next_date       date,                     -- 下一期的原定日期
  last_date       date,                     -- 最近一次產生的原定日期
  generated_count int not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id, category_kind) references public.categories (id, user_id, kind),

  constraint rule_weekly_shape check (
    (freq = 'weekly') = (weekdays is not null)
    and (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]))
  ),
  constraint rule_monthly_shape check ((freq in ('monthly', 'yearly')) = (month_day is not null)),
  constraint rule_yearly_shape  check ((freq = 'yearly') = (month_of_year is not null)),
  constraint rule_adjust_scope  check (weekend_adjust = 'none' or freq in ('monthly', 'yearly')),
  constraint rule_one_end       check (end_date is null or max_count is null),
  constraint rule_end_after     check (end_date is null or end_date >= start_date)
);

create table if not exists public.recurring_rule_tags (
  rule_id uuid not null,
  tag_id  uuid not null,
  user_id uuid not null default auth.uid(),
  primary key (rule_id, tag_id),
  foreign key (rule_id, user_id) references public.recurring_rules (id, user_id) on delete cascade,
  foreign key (tag_id, user_id)  references public.tags (id, user_id) on delete cascade
);

create index if not exists recurring_rules_next_idx     on public.recurring_rules (next_date) where next_date is not null;
create index if not exists recurring_rules_account_idx  on public.recurring_rules (user_id, account_id);
create index if not exists recurring_rules_category_idx on public.recurring_rules (user_id, category_id);
create index if not exists recurring_rule_tags_tag_idx  on public.recurring_rule_tags (tag_id);


-- ---------------------------------------------------------------------
-- 2. 交易表：記住由哪條規則、哪一期產生
--    刪除規則時只把 recurring_rule_id 設為 null，交易保留
-- ---------------------------------------------------------------------
alter table public.transactions add column if not exists recurring_rule_id uuid;
alter table public.transactions add column if not exists occurrence_date   date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_recurring_rule_fk') then
    alter table public.transactions
      add constraint transactions_recurring_rule_fk
      foreign key (recurring_rule_id, user_id) references public.recurring_rules (id, user_id)
      on delete set null (recurring_rule_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_recurring_occurrence_uniq') then
    alter table public.transactions
      add constraint transactions_recurring_occurrence_uniq unique (recurring_rule_id, occurrence_date);
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. 日期計算
-- ---------------------------------------------------------------------

-- 3.1 某年某月的第 d 日；超過當月天數時取月底
create or replace function public.clamp_month_day(p_year int, p_month int, p_day int)
returns date
language sql immutable
set search_path = ''
as $$
  select least(
    make_date(p_year, p_month, 1) + (p_day - 1),
    (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date
  )
$$;

-- 3.2 遇週末調整（before：提前到星期五；after：延後到星期一）
create or replace function public.adjust_weekend(p_date date, p_mode text)
returns date
language sql immutable
set search_path = ''
as $$
  select case
    when p_date is null or p_mode is null or p_mode = 'none' then p_date
    when extract(isodow from p_date) = 6 then p_date + case when p_mode = 'before' then -1 else 2 end
    when extract(isodow from p_date) = 7 then p_date + case when p_mode = 'before' then -2 else 1 end
    else p_date
  end
$$;

-- 3.3 規則在 p_from（含）之後的第一個原定日期；找不到回傳 null
create or replace function public.rule_next_occurrence(r public.recurring_rules, p_from date)
returns date
language plpgsql immutable
set search_path = ''
as $$
declare
  v_from  date := greatest(p_from, r.start_date);
  v_d     date;
  v_k     int;
  v_wk0   date;
  v_i     int;
begin
  if v_from is null then
    return null;
  end if;

  if r.freq = 'daily' then
    v_k := ceil((v_from - r.start_date)::numeric / r.interval)::int;
    return r.start_date + v_k * r.interval;

  elsif r.freq = 'weekly' then
    v_wk0 := date_trunc('week', r.start_date)::date;            -- 起始週的星期一
    -- 從 v_from 所在週（或之後第一個符合間隔的週）開始找
    v_k := floor((date_trunc('week', v_from)::date - v_wk0) / 7.0)::int;
    v_k := v_k + ((r.interval - (v_k % r.interval)) % r.interval);
    for v_i in 0..2 loop
      for v_d in
        select (v_wk0 + (v_k + v_i * r.interval) * 7 + (wd - 1))::date
          from unnest(r.weekdays) as wd
         order by 1
      loop
        if v_d >= v_from then
          return v_d;
        end if;
      end loop;
    end loop;
    return null;

  elsif r.freq = 'monthly' then
    v_k := (extract(year from v_from)::int - extract(year from r.start_date)::int) * 12
         + (extract(month from v_from)::int - extract(month from r.start_date)::int);
    v_k := greatest(v_k, 0);
    v_k := v_k + ((r.interval - (v_k % r.interval)) % r.interval);
    for v_i in 0..2 loop
      v_d := (date_trunc('month', r.start_date) + make_interval(months => v_k + v_i * r.interval))::date;
      v_d := public.clamp_month_day(extract(year from v_d)::int, extract(month from v_d)::int, r.month_day);
      if v_d >= v_from then
        return v_d;
      end if;
    end loop;
    return null;

  else -- yearly
    v_k := greatest(extract(year from v_from)::int - extract(year from r.start_date)::int, 0);
    v_k := v_k + ((r.interval - (v_k % r.interval)) % r.interval);
    for v_i in 0..2 loop
      v_d := public.clamp_month_day(extract(year from r.start_date)::int + v_k + v_i * r.interval,
                                    r.month_of_year, r.month_day);
      if v_d >= v_from then
        return v_d;
      end if;
    end loop;
    return null;
  end if;
end;
$$;

-- 3.4 規則是否已結束（下一期超過結束日，或已達次數）
create or replace function public.rule_is_finished(r public.recurring_rules)
returns boolean
language sql immutable
set search_path = ''
as $$
  select r.next_date is null
      or (r.end_date is not null and r.next_date > r.end_date)
      or (r.max_count is not null and r.generated_count >= r.max_count)
$$;


-- ---------------------------------------------------------------------
-- 4. 規則寫入前：維護產生進度
-- ---------------------------------------------------------------------
create or replace function public.recurring_rules_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.generated_count := 0;
    new.last_date := null;
    new.next_date := public.rule_next_occurrence(new, new.start_date);
    return new;
  end if;

  -- 進度欄位只能由產生函式改（它會設定這個旗標）
  if coalesce(current_setting('app.recurring_generating', true), '') <> 'on' then
    new.generated_count := old.generated_count;
    new.last_date       := old.last_date;
    new.next_date       := old.next_date;

    if new.start_date is distinct from old.start_date and old.generated_count > 0 then
      raise exception '已產生過交易的固定收支不可更改開始日' using errcode = 'check_violation';
    end if;

    -- 週期改了：從下一次開始生效
    if (new.freq, new.interval, new.weekdays, new.month_day, new.month_of_year, new.start_date)
       is distinct from
       (old.freq, old.interval, old.weekdays, old.month_day, old.month_of_year, old.start_date) then
      new.next_date := public.rule_next_occurrence(
        new,
        case when old.last_date is null then new.start_date
             else greatest(old.last_date + 1, v_today) end
      );
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'recurring_rules_before_write'
       and tgrelid = 'public.recurring_rules'::regclass
  ) then
    create trigger recurring_rules_before_write
    before insert or update on public.recurring_rules
    for each row execute function public.recurring_rules_before_write();
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. 產生交易
-- ---------------------------------------------------------------------

-- 5.1 為某位使用者產生到 p_today 為止的交易（內部用，不開放給前端）
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

      v_txn := gen_random_uuid();
      insert into public.transactions (
        id, user_id, date, type, account_id, category_id, amount, note,
        recurring_rule_id, occurrence_date
      ) values (
        v_txn, r.user_id, public.adjust_weekend(r.next_date, r.weekend_adjust), r.type,
        r.account_id, r.category_id, r.amount, r.note,
        r.id, r.next_date
      )
      on conflict (recurring_rule_id, occurrence_date) do nothing;

      if found then
        insert into public.transaction_tags (transaction_id, tag_id, user_id)
        select v_txn, rt.tag_id, r.user_id
          from public.recurring_rule_tags rt
         where rt.rule_id = r.id;
        v_n := v_n + 1;
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

-- 5.2 排程用：所有使用者
create or replace function public.generate_recurring_all()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n    int := 0;
begin
  for v_user in
    select distinct user_id from public.recurring_rules where next_date is not null
  loop
    v_n := v_n + public.generate_recurring_for(v_user);
  end loop;
  return v_n;
end;
$$;

-- 5.3 前端用：只產生自己的
create or replace function public.generate_my_recurring()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '尚未登入' using errcode = 'insufficient_privilege';
  end if;
  return public.generate_recurring_for(auth.uid());
end;
$$;


-- ---------------------------------------------------------------------
-- 6. 儲存規則＋標籤，並立刻補產生到今天
--   前端：表單開啟時 crypto.randomUUID() 產生 id 一起送出（重按儲存不會重複建立）
--   p_rule 欄位：id, type, account_id, category_id, amount, note,
--               freq, interval, weekdays, month_day, month_of_year, weekend_adjust,
--               start_date, end_date, max_count
-- ---------------------------------------------------------------------
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
begin
  if jsonb_typeof(p_rule -> 'weekdays') = 'array' then
    select array_agg(distinct x::smallint order by x::smallint) into v_wd
      from jsonb_array_elements_text(p_rule -> 'weekdays') as x;
  end if;

  insert into public.recurring_rules as r (
    id, type, account_id, category_id, amount, note,
    freq, interval, weekdays, month_day, month_of_year, weekend_adjust,
    start_date, end_date, max_count
  ) values (
    v_id,
    p_rule ->> 'type',
    (p_rule ->> 'account_id')::uuid,
    (p_rule ->> 'category_id')::uuid,
    (p_rule ->> 'amount')::bigint,
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


-- ---------------------------------------------------------------------
-- 7. 標籤自動刪除：規則用到的標籤也算「有在用」
-- ---------------------------------------------------------------------
create or replace function public.transaction_tags_after_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.tags tg
   where tg.id = old.tag_id
     and not exists (select 1 from public.transaction_tags tt where tt.tag_id = old.tag_id)
     and not exists (select 1 from public.recurring_rule_tags rt where rt.tag_id = old.tag_id);
  return null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'recurring_rule_tags_after_delete'
       and tgrelid = 'public.recurring_rule_tags'::regclass
  ) then
    create trigger recurring_rule_tags_after_delete
    after delete on public.recurring_rule_tags
    for each row execute function public.transaction_tags_after_delete();
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. 管理頁列表 view：下次產生日（調整後）、是否已結束
-- ---------------------------------------------------------------------
create or replace view public.recurring_rule_list
with (security_invoker = true) as
select r.*,
       public.rule_is_finished(r) as is_finished,
       case when public.rule_is_finished(r) then null
            else public.adjust_weekend(r.next_date, r.weekend_adjust) end as next_run_date,
       coalesce((select array_agg(rt.tag_id) from public.recurring_rule_tags rt where rt.rule_id = r.id), '{}') as tag_ids
  from public.recurring_rules r;


-- ---------------------------------------------------------------------
-- 9. 帳戶、分類被規則使用時不能刪除：在使用次數 view 加上 rule_count
--    （欄位加在最後，前端判斷 canDelete 時一併考慮）
-- ---------------------------------------------------------------------
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
       (select count(*)::int from public.recurring_rules rr where rr.account_id = a.id) as rule_count
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

create or replace view public.category_usage
with (security_invoker = true) as
select c.id,
       c.user_id,
       c.name,
       c.kind,
       c.is_active,
       c.sort_order,
       coalesce(u.txn_count, 0) as txn_count,
       (select count(*)::int from public.recurring_rules rr where rr.category_id = c.id) as rule_count
  from public.categories c
  left join lateral (
    select count(*)::int as txn_count
      from public.transactions t
     where t.category_id = c.id
  ) u on true;


-- ---------------------------------------------------------------------
-- 10. RLS 與權限
-- ---------------------------------------------------------------------
alter table public.recurring_rules     enable row level security;
alter table public.recurring_rule_tags enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'own_recurring_rules') then
    create policy own_recurring_rules on public.recurring_rules
      for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own_recurring_rule_tags') then
    create policy own_recurring_rule_tags on public.recurring_rule_tags
      for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end;
$$;

-- 新增與修改請走 save_recurring_rule（它以呼叫者身分寫入，所以需要 insert／update）；
-- 產生進度欄位由觸發器保護，直接寫入也改不動
-- Supabase 預設會把新表開給 anon，先全部收回再開需要的
revoke all on public.recurring_rules, public.recurring_rule_tags, public.recurring_rule_list from anon, authenticated;
grant select, insert, update, delete on public.recurring_rules     to authenticated;
grant select, insert, delete         on public.recurring_rule_tags to authenticated;
grant select                         on public.recurring_rule_list to authenticated;
grant select                         on public.account_balances    to authenticated;
grant select                         on public.category_usage      to authenticated;

revoke execute on function public.recurring_rules_before_write()      from public, anon, authenticated;
revoke execute on function public.generate_recurring_for(uuid, date)  from public, anon, authenticated;
revoke execute on function public.generate_recurring_all()            from public, anon, authenticated;
revoke execute on function public.clamp_month_day(int, int, int)                     from public, anon;
revoke execute on function public.adjust_weekend(date, text)                          from public, anon;
revoke execute on function public.rule_next_occurrence(public.recurring_rules, date) from public, anon;
revoke execute on function public.rule_is_finished(public.recurring_rules)           from public, anon;
revoke execute on function public.generate_my_recurring()                            from public, anon;
revoke execute on function public.save_recurring_rule(jsonb, text[])                 from public, anon;

-- 純日期計算：觸發器與 view 以呼叫者身分執行，需要能呼叫
grant execute on function public.clamp_month_day(int, int, int)                     to authenticated;
grant execute on function public.adjust_weekend(date, text)                          to authenticated;
grant execute on function public.rule_next_occurrence(public.recurring_rules, date) to authenticated;
grant execute on function public.rule_is_finished(public.recurring_rules)           to authenticated;
grant execute on function public.generate_my_recurring()                            to authenticated;
grant execute on function public.save_recurring_rule(jsonb, text[])                 to authenticated;


-- ---------------------------------------------------------------------
-- 11. 排程：每天台北時間 00:05（UTC 16:05）產生到期的交易
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('generate-recurring', '5 16 * * *', 'select public.generate_recurring_all()');
  else
    raise notice '此資料庫沒有 pg_cron，略過排程（請改由前端呼叫 generate_my_recurring）';
  end if;
end;
$$;
