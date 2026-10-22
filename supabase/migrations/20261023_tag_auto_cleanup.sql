-- 2026-10-23：標籤不再被任何交易使用時自動刪除
-- 用法：Supabase 後台 → SQL Editor → 貼上全文 → Run（只需執行一次；權限設定不受影響）
--
-- 規則：只有「曾被使用、最後一筆關聯被移除」的標籤才會刪除。
--   - 刪除交易、或編輯交易拿掉標籤 → 該標籤若已沒有其他交易使用，就一起刪除
--   - 尚未被任何交易使用的標籤（例如日後在管理頁先建好的）不受影響
--
-- 沒執行時：一切照舊，沒用到的標籤會留著，可在管理頁手動刪除


-- 1. save_transaction：只移除這次被拿掉的標籤，沒變動的標籤不動
--    （舊版是「先全部刪掉再加回」，加上自動刪除後會讓沒變動的標籤被刪掉重建、id 改變）
create or replace function public.save_transaction(p_txn jsonb, p_tag_names text[] default '{}')
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


-- 2. 移除標籤關聯後：該標籤若已沒有任何交易使用，就刪除
--    觸發時機：刪除交易（關聯連帶刪除）、編輯交易拿掉標籤
--    以呼叫者身分執行，受 RLS 限制，只會刪到自己的標籤
create or replace function public.transaction_tags_after_delete()
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

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'transaction_tags_after_delete'
       and tgrelid = 'public.transaction_tags'::regclass
  ) then
    create trigger transaction_tags_after_delete
    after delete on public.transaction_tags
    for each row execute function public.transaction_tags_after_delete();
  end if;
end;
$$;

-- 觸發器函式不需要 execute 權限，與其他函式一致收回
revoke execute on function public.transaction_tags_after_delete() from public, anon, authenticated;
