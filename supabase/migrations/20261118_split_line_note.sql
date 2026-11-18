-- 拆帳每一行的備註（2026-11-18，需求 3.1）
--   transactions.line_note：拆帳各行自己的備註（例：「隔天早餐」「宵夜」）；一般交易一律為空字串
--   整筆共用的備註仍在 note（例：「7-11」）
--   save_split 的每一行多收 note → 寫入 line_note；取消拆帳（剩一行）時清空 line_note
--   filter_transactions 的關鍵字同時比對 note 與 line_note
--   可重複執行

alter table public.transactions add column if not exists line_note text not null default '';


-- 篩選：關鍵字比對備註與拆帳行備註（其餘同 20261022_filter_transfer.sql）
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
     and (coalesce(p_keyword, '') = '' or exists (
            select 1 from (select '%' || replace(replace(replace(p_keyword, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat) k
             where t.note ilike k.pat or t.line_note ilike k.pat))
$$;


-- 儲存拆帳（同 20261113_split.sql，每一行多了 note）
--   p_split：{ id（split_id）, date, account_id, note, lines: [{ id, category_id, amount, note }] }
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
    -- 行備註：取消拆帳（只剩一行）時清空
    update public.transactions t
       set line_note = case when v_n > 1 then btrim(coalesce(v_line ->> 'note', '')) else '' end
     where t.id = v_id and t.user_id = auth.uid()
       and t.line_note is distinct from case when v_n > 1 then btrim(coalesce(v_line ->> 'note', '')) else '' end;
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
revoke execute on function public.filter_transactions(date, date, uuid, text[], uuid[], uuid[], boolean, text) from public, anon;
grant execute on function public.filter_transactions(date, date, uuid, text[], uuid[], uuid[], boolean, text) to authenticated;
