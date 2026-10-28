-- Rift Vault: dati di ogni utente (collezione e mazzi), uno per account.
-- Da eseguire una volta nel SQL Editor del progetto Supabase.

create table if not exists public.vault (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Ogni utente vede e modifica solo la propria riga.
alter table public.vault enable row level security;

drop policy if exists "vault: leggi la tua" on public.vault;
create policy "vault: leggi la tua" on public.vault
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "vault: crea la tua" on public.vault;
create policy "vault: crea la tua" on public.vault
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "vault: modifica la tua" on public.vault;
create policy "vault: modifica la tua" on public.vault
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
