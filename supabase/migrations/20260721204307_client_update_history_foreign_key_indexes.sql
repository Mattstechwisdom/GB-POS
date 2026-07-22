create index if not exists client_update_history_qr_token_idx
  on public.client_update_history(qr_token_id);

create index if not exists client_update_history_created_by_idx
  on public.client_update_history(created_by);
