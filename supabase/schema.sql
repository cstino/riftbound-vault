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

-- Collezione condivisa: gli account dello stesso gruppo vedono e modificano la stessa riga di
-- shared_vault (carte possedute e mazzi posseduti); i mazzi personali restano in vault.
-- I gruppi li gestisce l'amministratore: insert into public.vault_members values ('<user id>', '<group id>').
create table if not exists public.vault_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  group_id uuid not null
);

alter table public.vault_members enable row level security;

drop policy if exists "membri: leggi il tuo gruppo" on public.vault_members;
create policy "membri: leggi il tuo gruppo" on public.vault_members
  for select to authenticated using (auth.uid() = user_id);

create table if not exists public.shared_vault (
  group_id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_vault enable row level security;

drop policy if exists "condivisa: leggi" on public.shared_vault;
create policy "condivisa: leggi" on public.shared_vault
  for select to authenticated using (group_id in (select m.group_id from public.vault_members m where m.user_id = auth.uid()));

drop policy if exists "condivisa: crea" on public.shared_vault;
create policy "condivisa: crea" on public.shared_vault
  for insert to authenticated with check (group_id in (select m.group_id from public.vault_members m where m.user_id = auth.uid()));

drop policy if exists "condivisa: modifica" on public.shared_vault;
create policy "condivisa: modifica" on public.shared_vault
  for update to authenticated
  using (group_id in (select m.group_id from public.vault_members m where m.user_id = auth.uid()))
  with check (group_id in (select m.group_id from public.vault_members m where m.user_id = auth.uid()));
