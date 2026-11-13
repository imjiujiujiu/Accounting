-- 拆帳（2026-11-13，見專案文件 claude/advance-and-split.md）
--   一筆消費分多行，各有分類與金額。每一行存成一筆一般交易，以 split_id（同一筆消費）綁在一起；
--   篩選、統計、匯出、餘額都沿用現有邏輯（每一行各自計算），只有表單與清單顯示把同一個 split_id 併成一列。
--   同一筆拆帳的各行：日期、帳戶、備註、標籤相同；第一版只能是主幣別（台幣）支出、不能是外幣刷卡。
--   行的順序＝created_at（save_split 依序寫入，每行差 1 微秒）。
--   可重複執行。

alter table public.transactions add column if not exists split_id uuid;
create index if not exists transactions_user_split_idx on public.transactions (user_id, split_id) where split_id is not null;


-- 儲存拆帳（新增或修改）
--   p_split：{ id（split_id）, date, account_id, note, lines: [{ id, category_id, amount }] }
--   - 行數 ≥ 2：寫入每一行（沿用 save_transaction，標籤每行相同），刪除這次被拿掉的行
--   - 行數 = 1：取消拆帳，剩下那一行變回一般交易（split_id 設為 null），其餘行刪除
--   - 把一筆既有的一般交易改成拆帳：第一行沿用它的 id
--   回傳 split_id（取消拆帳時回傳 null）
create or replace function public.save_split(p_split jsonb, p_tag_names text[] default '{}')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_split   uuid := coalesce((p_split ->> 'id')::uuid, gen_random_uuid());
  v_lines   jsonb := coalesce(p_split -> 'lines', '[]'::jsonb);
  v_n       int := jsonb_array_length(coalesce(p_split -> 'lines', '[]'::jsonb));
  v_line    jsonb;
  v_ids     uuid[] := '{}';
  v_id      uuid;
  v_i       int := 0;
  v_base    timestamptz := clock_timestamp();
  v_acc_cur text;
  v_main    text;
begin
  if v_n < 1 then
    raise exception '拆帳至少要一行' using errcode = 'check_violation';
  end if;

  select a.currency into v_acc_cur from public.accounts a
   where a.id = (p_split ->> 'account_id')::uuid and a.user_id = auth.uid();
  select coalesce((select s.base_currency from public.settings s where s.user_id = auth.uid()), 'TWD') into v_main;
  if v_n > 1 and v_acc_cur is distinct from v_main then
    raise exception '拆帳目前只支援台幣帳戶' using errcode = 'check_violation';
  end if;

  -- 行 id 不能屬於別筆拆帳
  if exists (
    select 1 from jsonb_array_elements(v_lines) l
      join public.transactions t on t.id = (l ->> 'id')::uuid
     where t.split_id is not null and t.split_id <> v_split
  ) then
    raise exception '這一行屬於另一筆拆帳' using errcode = 'check_violation';
  end if;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_i := v_i + 1;
    v_id := coalesce((v_line ->> 'id')::uuid, gen_random_uuid());
    -- 新的一行：依序給 created_at，讓行的順序固定
    if not exists (select 1 from public.transactions t where t.id = v_id) then
      insert into public.transactions (id, date, type, account_id, category_id, amount, note, created_at)
      values (v_id, (p_split ->> 'date')::date, 'expense', (p_split ->> 'account_id')::uuid,
              (v_line ->> 'category_id')::uuid, (v_line ->> 'amount')::bigint,
              coalesce(p_split ->> 'note', ''), v_base + make_interval(secs => v_i / 1000000.0));
    end if;
    perform public.save_transaction(
      jsonb_build_object(
        'id', v_id,
        'date', p_split ->> 'date',
        'type', 'expense',
        'account_id', p_split ->> 'account_id',
        'category_id', v_line ->> 'category_id',
        'amount', v_line ->> 'amount',
        'note', coalesce(p_split ->> 'note', '')
      ),
      p_tag_names
    );
    v_ids := v_ids || v_id;
  end loop;

  delete from public.transactions t
   where t.split_id = v_split and t.user_id = auth.uid() and not (t.id = any (v_ids));

  if v_n = 1 then
    update public.transactions t set split_id = null
     where t.id = v_ids[1] and t.user_id = auth.uid() and t.split_id is not null;
    return null;
  end if;

  update public.transactions t set split_id = v_split
   where t.id = any (v_ids) and t.user_id = auth.uid() and t.split_id is distinct from v_split;
  return v_split;
end;
$$;

revoke execute on function public.save_split(jsonb, text[]) from public, anon;
grant execute on function public.save_split(jsonb, text[]) to authenticated;
