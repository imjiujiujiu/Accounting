-- =====================================================================
-- 記帳網頁 schema v1
-- 用法：Supabase 後台 → SQL Editor → 貼上全文 → Run（在全新專案執行一次）
-- 對應需求文件第 5 節；與文件不同或補充之處以【補充】標註
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. 幣別參考表（所有人共用、唯讀）
--    minor_unit：金額存「最小單位整數」時的小數位數
--    【補充】台幣實務上不用角／分，設為 0，即台幣以「元」為單位存整數
-- ---------------------------------------------------------------------
create table public.currencies (
  code       text primary key check (code ~ '^[A-Z]{3}$'),
  name_zh    text not null,
  minor_unit smallint not null check (minor_unit between 0 and 4),
  sort_order int not null default 0
);

insert into public.currencies (code, name_zh, minor_unit, sort_order) values
  ('TWD', '新台幣', 0, 0),
  ('JPY', '日圓',   0, 1),
  ('USD', '美元',   2, 2),
  ('KRW', '韓元',   0, 3),
  ('EUR', '歐元',   2, 4),
  ('THB', '泰銖',   2, 5);


-- ---------------------------------------------------------------------
-- 1. 設定
-- ---------------------------------------------------------------------
create table public.settings (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  base_currency text not null default 'TWD' references public.currencies (code),
  updated_at    timestamptz not null default now()
);

-- 【補充】各外幣預設匯率拆成獨立表（一幣別一列），比塞在 settings 好查詢與擴充
-- rate：每 1 單位原幣兌主幣別（例：JPY → 0.21）
create table public.default_rates (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  currency   text not null references public.currencies (code),
  rate       numeric(14, 6) not null check (rate > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, currency)
);


-- ---------------------------------------------------------------------
-- 2. 帳戶
--    有交易的帳戶無法刪除（由 transactions 的外鍵擋下，錯誤碼 23503）
-- ---------------------------------------------------------------------
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  type            text not null check (type in ('cash', 'bank', 'e_wallet', 'credit_card', 'other')),
  currency        text not null default 'TWD' references public.currencies (code),
  initial_balance bigint not null default 0,
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, user_id)            -- 供交易表做「同一使用者」的複合外鍵
);


-- ---------------------------------------------------------------------
-- 3. 分類（沒有交易使用才能刪除：有交易時由 transactions 的外鍵擋下，錯誤碼 23503；只能停用）
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  kind       text not null check (kind in ('income', 'expense')),
  is_active  boolean not null default true,
  sort_order int not null default 0,
  unique (user_id, kind, name),
  unique (id, user_id, kind)      -- 讓交易的分類必須與交易類型同為收入或支出
);


-- ---------------------------------------------------------------------
-- 4. 標籤
-- ---------------------------------------------------------------------
create table public.tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name    text not null check (length(trim(name)) > 0),
  unique (id, user_id)
);
-- 同一使用者下名稱不重複（不分大小寫、忽略前後空白）
create unique index tags_user_name_uniq on public.tags (user_id, lower(trim(name)));


-- ---------------------------------------------------------------------
-- 5. 交易
-- ---------------------------------------------------------------------
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date              date not null,
  type              text not null check (type in ('income', 'expense', 'transfer')),
  account_id        uuid not null,           -- 收入／支出：所屬帳戶；轉帳：轉出帳戶
  to_account_id     uuid,                    -- 僅轉帳
  category_id       uuid,                    -- 轉帳為 null
  amount            bigint check (amount > 0),           -- 外幣刷卡回壓前為 null
  estimated_amount  bigint check (estimated_amount >= 0),-- 外幣刷卡預估主幣別金額
  to_amount         bigint check (to_amount > 0),        -- 僅轉帳；同幣別可省略，自動等於 amount
  original_amount   bigint check (original_amount > 0),  -- 僅外幣刷卡
  original_currency text references public.currencies (code),
  fee               bigint check (fee >= 0),             -- 僅外幣刷卡回壓時
  note              text not null default '',
  settled_at        timestamptz,             -- 【補充】回壓時間，用來找「最近一次回壓」的匯率
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 推導欄位（由資料庫自動計算，前端唯讀）
  -- 【補充】文件說「不另存」；改用 generated column，仍是推導值、不會不同步，查詢與加總更簡單
  category_kind  text    generated always as (case when type <> 'transfer' then type end) stored,
  is_pending     boolean generated always as (original_amount is not null and amount is null) stored,
  counted_amount bigint  generated always as (
                   case when amount is not null then amount + coalesce(fee, 0) else estimated_amount end
                 ) stored,               -- 計入金額：已回壓＝實際支出；待回壓＝預估（可能 null）

  unique (id, user_id),

  -- 複合外鍵：只能參照「自己的」帳戶／分類（RLS 擋不到外鍵檢查，所以用這招）
  foreign key (account_id, user_id)    references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id, category_kind) references public.categories (id, user_id, kind),

  -- 轉帳：有轉入帳戶與兩個金額、沒有分類、不能同帳戶、不能是外幣刷卡
  constraint transfer_shape check (
    type <> 'transfer' or (
      to_account_id is not null and to_account_id <> account_id
      and category_id is null and amount is not null and to_amount is not null
      and original_amount is null and fee is null and estimated_amount is null
    )
  ),
  -- 收入／支出：必須有分類、沒有轉入
  constraint income_expense_shape check (
    type = 'transfer' or (category_id is not null and to_account_id is null and to_amount is null)
  ),
  -- amount 為 null 時 original_amount 必須有值
  constraint amount_or_original check (amount is not null or original_amount is not null),
  -- 原幣金額與幣別成對
  constraint original_pair check ((original_amount is null) = (original_currency is null)),
  -- 外幣刷卡只用於支出
  constraint original_expense_only check (original_amount is null or type = 'expense'),
  -- 預估值只屬於外幣刷卡
  constraint estimated_only_foreign check (estimated_amount is null or original_amount is not null),
  -- 手續費只在外幣刷卡回壓後
  constraint fee_only_settled check (fee is null or (original_amount is not null and amount is not null))
);


-- ---------------------------------------------------------------------
-- 6. 交易 × 標籤
-- ---------------------------------------------------------------------
create table public.transaction_tags (
  transaction_id uuid not null,
  tag_id         uuid not null,
  user_id        uuid not null default auth.uid(),
  primary key (transaction_id, tag_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (tag_id, user_id)         references public.tags (id, user_id) on delete cascade
);


-- ---------------------------------------------------------------------
-- 7. 索引
-- ---------------------------------------------------------------------
create index transactions_user_date_idx    on public.transactions (user_id, date desc, created_at desc);
create index transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index transactions_account_idx      on public.transactions (user_id, account_id);
create index transactions_to_account_idx   on public.transactions (user_id, to_account_id) where to_account_id is not null;
create index transactions_category_idx     on public.transactions (user_id, category_id);
create index transactions_pending_idx      on public.transactions (user_id, original_currency) where is_pending;
create index transactions_settled_idx      on public.transactions (user_id, original_currency, settled_at desc) where original_amount is not null and amount is not null;
create index transaction_tags_tag_idx      on public.transaction_tags (tag_id);


-- =====================================================================
-- 8. 函式與觸發器
-- =====================================================================

-- 8.1 預估主幣別金額
--   1) 該幣別最近一次回壓的實際匯率 × 原幣金額
--   2) 沒有回壓紀錄 → 設定頁的預設匯率
--   3) 都沒有 → null（不計入）
--   前端在表單即時顯示「約 $630（預估）」也呼叫這支：rpc('estimate_amount', {...})
create function public.estimate_amount(p_currency text, p_original_amount bigint)
returns bigint
language plpgsql stable
set search_path = ''
as $$
declare
  v_paid     bigint;
  v_original bigint;
  v_rate     numeric;
  v_base     text;
  v_om       int;
  v_bm       int;
begin
  if p_currency is null or p_original_amount is null then
    return null;
  end if;

  select t.amount + coalesce(t.fee, 0), t.original_amount
    into v_paid, v_original
    from public.transactions t
   where t.user_id = auth.uid()
     and t.original_currency = p_currency
     and t.original_amount is not null
     and t.amount is not null
   order by t.settled_at desc nulls last, t.updated_at desc
   limit 1;

  if found then
    -- 同一幣別對，最小單位互相抵銷，直接比例換算
    return round(v_paid::numeric * p_original_amount / v_original);
  end if;

  select r.rate into v_rate
    from public.default_rates r
   where r.user_id = auth.uid() and r.currency = p_currency;

  if v_rate is null then
    return null;
  end if;

  select coalesce((select s.base_currency from public.settings s where s.user_id = auth.uid()), 'TWD')
    into v_base;
  select c.minor_unit into v_om from public.currencies c where c.code = p_currency;
  select c.minor_unit into v_bm from public.currencies c where c.code = v_base;

  return round(v_rate * p_original_amount / power(10, v_om) * power(10, v_bm));
end;
$$;


-- 8.2 交易寫入前：補值與跨表檢查
create function public.transactions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from_cur text;
  v_to_cur   text;
begin
  new.updated_at := now();

  select a.currency into v_from_cur from public.accounts a where a.id = new.account_id;

  -- 轉帳：同幣別時 to_amount 自動等於 amount，且不可不同
  if new.type = 'transfer' then
    select a.currency into v_to_cur from public.accounts a where a.id = new.to_account_id;
    if v_from_cur = v_to_cur then
      if new.to_amount is null then
        new.to_amount := new.amount;
      elsif new.to_amount <> new.amount then
        raise exception '同幣別轉帳的轉出與轉入金額必須相同' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- 外幣刷卡：原幣不可與帳戶幣別相同
  if new.original_currency is not null and new.original_currency = v_from_cur then
    raise exception '外幣消費的幣別不可與帳戶幣別相同' using errcode = 'check_violation';
  end if;

  -- 回壓時間：由待回壓變成已回壓的那一刻記下
  if new.original_amount is not null and new.amount is not null then
    if tg_op = 'INSERT' or old.amount is null then
      new.settled_at := now();
    end if;
  else
    new.settled_at := null;
  end if;

  -- 預估值：新增時，或待回壓期間改了原幣金額／幣別時，重新計算
  if new.original_amount is not null and new.amount is null then
    if tg_op = 'INSERT'
       or new.original_amount is distinct from old.original_amount
       or new.original_currency is distinct from old.original_currency then
      new.estimated_amount := public.estimate_amount(new.original_currency, new.original_amount);
    end if;
  end if;

  return new;
end;
$$;

create trigger transactions_before_write
before insert or update on public.transactions
for each row execute function public.transactions_before_write();


-- 8.3 帳戶已有交易時不可改幣別（否則歷史金額單位全錯）
create function public.accounts_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency and exists (
       select 1 from public.transactions t
        where t.account_id = old.id or t.to_account_id = old.id
     ) then
    raise exception '帳戶已有交易，不可更改幣別' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger accounts_before_update
before update on public.accounts
for each row execute function public.accounts_before_update();


-- 8.4 取得或建立標籤（記帳時邊打邊建）
create function public.get_or_create_tag(p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id   uuid;
  v_name text := trim(p_name);
begin
  if v_name is null or v_name = '' then
    raise exception '標籤名稱不可空白' using errcode = 'check_violation';
  end if;

  select t.id into v_id from public.tags t
   where t.user_id = auth.uid() and lower(trim(t.name)) = lower(v_name);

  if v_id is null then
    insert into public.tags (name) values (v_name)
    on conflict (user_id, lower(trim(name))) do nothing
    returning id into v_id;
    if v_id is null then  -- 同時有人建了同名標籤
      select t.id into v_id from public.tags t
       where t.user_id = auth.uid() and lower(trim(t.name)) = lower(v_name);
    end if;
  end if;

  return v_id;
end;
$$;


-- 8.5 儲存交易＋標籤（同一個資料庫交易，全部成功或全部失敗）
--   標籤只移除這次被拿掉的，沒變動的不動（搭配 8.6 的自動刪除，避免標籤被刪掉重建）。
--   前端：開啟表單時 crypto.randomUUID() 產生 id 一起送出。
--   這樣「儲存失敗、手動再按一次」時，若第一次其實已寫入，只會覆蓋同一筆，不會重複新增。
--   p_txn 欄位：id, date, type, account_id, to_account_id, category_id,
--              amount, to_amount, original_amount, original_currency, fee, note
create function public.save_transaction(p_txn jsonb, p_tag_names text[] default '{}')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id      uuid := coalesce((p_txn ->> 'id')::uuid, gen_random_uuid());
  v_tag     text;
  v_tag_ids uuid[] := '{}';
begin
  insert into public.transactions as t (
    id, date, type, account_id, to_account_id, category_id,
    amount, to_amount, original_amount, original_currency, fee, note
  ) values (
    v_id,
    (p_txn ->> 'date')::date,
    p_txn ->> 'type',
    (p_txn ->> 'account_id')::uuid,
    (p_txn ->> 'to_account_id')::uuid,
    (p_txn ->> 'category_id')::uuid,
    (p_txn ->> 'amount')::bigint,
    (p_txn ->> 'to_amount')::bigint,
    (p_txn ->> 'original_amount')::bigint,
    p_txn ->> 'original_currency',
    (p_txn ->> 'fee')::bigint,
    coalesce(p_txn ->> 'note', '')
  )
  on conflict (id) do update set
    date              = excluded.date,
    type              = excluded.type,
    account_id        = excluded.account_id,
    to_account_id     = excluded.to_account_id,
    category_id       = excluded.category_id,
    amount            = excluded.amount,
    to_amount         = excluded.to_amount,
    original_amount   = excluded.original_amount,
    original_currency = excluded.original_currency,
    fee               = excluded.fee,
    note              = excluded.note
  where t.user_id = auth.uid();

  if not found then
    raise exception '找不到這筆交易' using errcode = 'no_data_found';
  end if;

  foreach v_tag in array coalesce(p_tag_names, '{}') loop
    if trim(v_tag) <> '' then
      v_tag_ids := v_tag_ids || public.get_or_create_tag(v_tag);
    end if;
  end loop;

  delete from public.transaction_tags
   where transaction_id = v_id
     and not (tag_id = any (v_tag_ids));

  insert into public.transaction_tags (transaction_id, tag_id)
  select v_id, x from unnest(v_tag_ids) as x
  on conflict do nothing;

  return v_id;
end;
$$;


-- 8.6 標籤不再被任何交易使用時自動刪除
--   只有「曾被使用、最後一筆關聯被移除」的標籤才會刪除；尚未被使用的標籤不受影響。
--   觸發時機：刪除交易（關聯連帶刪除）、編輯交易拿掉標籤。以呼叫者身分執行，受 RLS 限制。
create function public.transaction_tags_after_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.tags tg
   where tg.id = old.tag_id
     and not exists (select 1 from public.transaction_tags tt where tt.tag_id = old.tag_id);
  return null;
end;
$$;

create trigger transaction_tags_after_delete
after delete on public.transaction_tags
for each row execute function public.transaction_tags_after_delete();


-- 8.7 篩選（清單、合計、分類加總共用同一套條件）
--   參數為 null 或空陣列 = 不篩選
--   p_account_id：左上角帳戶選單；轉帳的轉出或轉入任一邊符合即列出
--   p_category_ids：不套用在轉帳上（轉帳沒有分類；要不要列出轉帳由 p_types 決定）
--   p_tag_ids：含任一標籤即符合
--   p_keyword：只比對備註，不分大小寫，部分符合
--   清單用法：rpc('filter_transactions', {...}, { count: 'exact' })
--             .order('date', {ascending:false}).order('created_at', {ascending:false})
--             .range(0, 49)
create function public.filter_transactions(
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


-- 8.8 收支合計（不受分頁影響）
--   幣別範圍：選了單一帳戶 → 該帳戶幣別；選「全部帳戶」→ 只算主幣別帳戶（外幣錢包不併入）
--   轉帳一律不計
--   estimated_count：含幾筆預估（畫面顯示「含 N 筆預估」）
--   excluded_count ：幾筆待回壓但沒有預估值、未計入
create function public.summarize_transactions(
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
     where t.type <> 'transfer'
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


-- 8.9 依分類加總（預設支出）
create function public.summarize_by_category(
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
   group by t.category_id
   order by 2 desc
$$;


-- 8.10 手機精簡清單：日期在最近兩天內，或最近兩天內新增（今天＋昨天，依台北時間）
create function public.recent_transactions(p_tz text default 'Asia/Taipei')
returns setof public.transactions
language sql stable
set search_path = ''
as $$
  select t.*
    from public.transactions t
   where t.user_id = auth.uid()
     and (   t.date >= (now() at time zone p_tz)::date - 1
          or t.created_at >= (((now() at time zone p_tz)::date - 1)::timestamp at time zone p_tz))
$$;


-- =====================================================================
-- 9. 帳戶餘額 view（帳戶選單用）
--   balance：待回壓以預估值計入；無預估值者略過
--   pending_count：「另有 N 筆外幣待回壓」
--   pending_unestimated_count：其中幾筆沒有預估值、未計入餘額
--   security_invoker：查詢時套用呼叫者的 RLS
-- =====================================================================
create view public.account_balances
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
       coalesce(o.txn_count, 0) + coalesce(i.txn_count, 0) as txn_count  -- 0 才能刪除
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


-- 分類使用次數 view（管理頁用）：txn_count 為 0 才能刪除
create view public.category_usage
with (security_invoker = true) as
select c.id,
       c.user_id,
       c.name,
       c.kind,
       c.is_active,
       c.sort_order,
       coalesce(u.txn_count, 0) as txn_count
  from public.categories c
  left join lateral (
    select count(*)::int as txn_count
      from public.transactions t
     where t.category_id = c.id
  ) u on true;


-- =====================================================================
-- 10. 新使用者預設資料（設定列＋預設分類）
--   第一次 Google 登入建立帳號時自動執行。可重複執行，不會產生重複資料。
--   若你在執行這份 SQL 之前就已經登入過，手動補跑一次：
--     select public.seed_user_defaults(id) from auth.users;
-- =====================================================================
create function public.seed_user_defaults(p_user_id uuid)
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

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();


-- =====================================================================
-- 11. RLS：只能讀寫 user_id = auth.uid() 的資料
-- =====================================================================
alter table public.currencies       enable row level security;
alter table public.settings         enable row level security;
alter table public.default_rates    enable row level security;
alter table public.accounts         enable row level security;
alter table public.categories       enable row level security;
alter table public.tags             enable row level security;
alter table public.transactions     enable row level security;
alter table public.transaction_tags enable row level security;

create policy currencies_read on public.currencies
  for select to authenticated using (true);

create policy own_settings on public.settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy own_default_rates on public.default_rates
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy own_accounts on public.accounts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 分類：可讀、新增、修改、刪除（有交易使用的刪除會被外鍵擋下）
create policy own_categories_select on public.categories
  for select to authenticated using (user_id = (select auth.uid()));
create policy own_categories_insert on public.categories
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_categories_update on public.categories
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_categories_delete on public.categories
  for delete to authenticated using (user_id = (select auth.uid()));

create policy own_tags on public.tags
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy own_transactions on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy own_transaction_tags on public.transaction_tags
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));


-- =====================================================================
-- 12. 權限：未登入（anon）什麼都碰不到；登入者只拿到需要的操作
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;

grant select                         on public.currencies       to authenticated;
grant select, insert, update         on public.settings         to authenticated;
grant select, insert, update, delete on public.default_rates    to authenticated;
grant select, insert, update, delete on public.accounts         to authenticated;
grant select, insert, update, delete on public.categories       to authenticated;
grant select, insert, update, delete on public.tags             to authenticated;
grant select, insert, update, delete on public.transactions     to authenticated;
grant select, insert, update, delete on public.transaction_tags to authenticated;
grant select                         on public.account_balances to authenticated;
grant select                         on public.category_usage   to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.estimate_amount(text, bigint)                                       to authenticated;
grant execute on function public.get_or_create_tag(text)                                             to authenticated;
grant execute on function public.save_transaction(jsonb, text[])                                     to authenticated;
grant execute on function public.filter_transactions(date, date, uuid, text[], uuid[], uuid[], boolean, text)    to authenticated;
grant execute on function public.summarize_transactions(date, date, uuid, text[], uuid[], uuid[], boolean, text) to authenticated;
grant execute on function public.summarize_by_category(date, date, uuid, text, uuid[], uuid[], boolean, text)    to authenticated;
grant execute on function public.recent_transactions(text)                                           to authenticated;
-- 觸發器函式不需要 execute 權限；seed_user_defaults 為 security definer，刻意不開放給前端
