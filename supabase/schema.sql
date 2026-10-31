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

-- Partite online (src/lib/onlineMatch.ts). I due dispositivi fanno girare lo stesso motore e si
-- scambiano solo le risposte alle decisioni, che ognuno controlla con validAnswer.
-- Il seme nasce da due contributi: l'host pubblica l'impronta del suo (host_commit) prima di
-- vedere quello dell'ospite e lo rivela dopo, così nessuno dei due può sceglierlo da solo.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host uuid not null default auth.uid() references auth.users (id) on delete cascade,
  host_name text not null,
  host_deck jsonb not null,
  host_bf int,
  host_commit text not null,
  host_seed bigint,
  host_salt text,
  guest uuid references auth.users (id) on delete cascade,
  guest_name text,
  guest_deck jsonb,
  guest_bf int,
  guest_seed bigint,
  status text not null default 'waiting' check (status in ('waiting', 'joined', 'playing', 'over')),
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;

drop policy if exists "partite: leggi" on public.matches;
-- chi conosce il codice deve poter trovare una partita in attesa per entrarci
create policy "partite: leggi" on public.matches
  for select to authenticated using (auth.uid() in (host, guest) or (status = 'waiting' and guest is null));

drop policy if exists "partite: crea" on public.matches;
create policy "partite: crea" on public.matches
  for insert to authenticated with check (auth.uid() = host and guest is null and status = 'waiting' and host_seed is null);

drop policy if exists "partite: entra" on public.matches;
drop policy if exists "partite: giocatori" on public.matches;
create policy "partite: aggiorna" on public.matches
  for update to authenticated
  using (auth.uid() in (host, guest) or (status = 'waiting' and guest is null))
  with check (auth.uid() in (host, guest));

-- Ogni passaggio di stato può cambiare solo le sue colonne, e il seme rivelato deve
-- corrispondere all'impronta pubblicata.
create or replace function public.matches_guard() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.code <> old.code or new.host <> old.host or new.host_name <> old.host_name
     or new.host_deck <> old.host_deck or new.host_bf is distinct from old.host_bf or new.host_commit <> old.host_commit
     or new.created_at <> old.created_at then
    raise exception 'campi della partita non modificabili';
  end if;
  if old.status = 'waiting' and new.status = 'joined' then
    if old.guest is not null or new.guest is distinct from auth.uid() or new.guest = old.host
       or new.guest_deck is null or new.guest_seed is null or new.host_seed is not null or new.host_salt is not null then
      raise exception 'ingresso non valido';
    end if;
  elsif old.status = 'joined' and new.status = 'playing' then
    if auth.uid() <> old.host or new.host_seed is null or new.host_salt is null
       or encode(sha256(convert_to(new.host_seed::text || ':' || new.host_salt, 'UTF8')), 'hex') <> old.host_commit then
      raise exception 'seme non corrispondente all''impronta';
    end if;
  elsif old.status in ('joined', 'playing') and new.status = 'over' then
    null;
  elsif old.status = 'waiting' and new.status = 'over' and auth.uid() = old.host then
    null; -- l'host annulla una partita in cui non è entrato nessuno
  else
    raise exception 'passaggio di stato non valido';
  end if;
  if old.status <> 'waiting' and (new.guest is distinct from old.guest or new.guest_name is distinct from old.guest_name
     or new.guest_deck is distinct from old.guest_deck or new.guest_bf is distinct from old.guest_bf or new.guest_seed is distinct from old.guest_seed) then
    raise exception 'dati dell''ospite non modificabili';
  end if;
  if old.status = 'playing' and (new.host_seed is distinct from old.host_seed or new.host_salt is distinct from old.host_salt) then
    raise exception 'seme non modificabile';
  end if;
  return new;
end $$;

drop trigger if exists matches_guard on public.matches;
create trigger matches_guard before update on public.matches for each row execute function public.matches_guard();

-- Mosse: solo aggiunte (nessuna policy di modifica o cancellazione), una per numero.
create table if not exists public.match_moves (
  match_id uuid not null references public.matches (id) on delete cascade,
  seq int not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'answer' check (kind in ('answer', 'resign')),
  answer jsonb,
  hash text,
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

alter table public.match_moves enable row level security;

drop policy if exists "mosse: leggi" on public.match_moves;
create policy "mosse: leggi" on public.match_moves
  for select to authenticated using (exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.host, m.guest)));

drop policy if exists "mosse: aggiungi" on public.match_moves;
create policy "mosse: aggiungi" on public.match_moves
  for insert to authenticated with check (
    auth.uid() = user_id and exists (select 1 from public.matches m where m.id = match_id and m.status = 'playing' and auth.uid() in (m.host, m.guest))
  );

-- aggiornamenti in tempo reale per le due tabelle
do $$
begin
  alter publication supabase_realtime add table public.matches;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.match_moves;
exception when duplicate_object then null;
end $$;
