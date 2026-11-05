-- NEXA VET CONTROL v2.0 — NOVO ESQUEMA (horas adicionais de serviços PJ)
-- IMPORTANTE: execute em projeto NOVO do Supabase. NÃO aplique por cima do esquema de ponto da v1.
-- Todas as operações de dados passam por Edge Function autenticada; não permitir acesso direto pelo cliente.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 3 and 140),
  email text not null,
  role text not null check (role in ('owner','finance','worker')),
  pj_cnpj text,
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_email_lower_idx on public.profiles(lower(email));

create table if not exists public.hourly_rates (
  worker_id uuid primary key references public.profiles(id) on delete cascade,
  rate numeric(12,2) not null check (rate > 0 and rate <= 100000),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null check (length(trim(company_name)) >= 3),
  closing_day smallint not null default 25 check (closing_day between 1 and 28),
  updated_at timestamptz not null default now()
);
insert into public.clinic_settings (id,company_name,closing_day)
values (1,'Minha clínica veterinária',25)
on conflict (id) do nothing;

create table if not exists public.extra_hours (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  reason text not null check (length(trim(reason)) between 15 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rate_snapshot numeric(12,2) not null check (rate_snapshot > 0),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extra_hours_duration check (ended_at > started_at and ended_at <= started_at + interval '16 hours')
);
create index if not exists extra_hours_worker_end_idx on public.extra_hours (worker_id,ended_at desc);
create index if not exists extra_hours_status_idx on public.extra_hours (status,created_at desc);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id),
  period_key text not null check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  total_hours numeric(12,3) not null check (total_hours >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  unique(worker_id,period_key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  action text not null,
  details text not null,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- Bloqueia a leitura/escrita direta por cliente, inclusive quando usuário está autenticado.
alter table public.profiles enable row level security;
alter table public.hourly_rates enable row level security;
alter table public.clinic_settings enable row level security;
alter table public.extra_hours enable row level security;
alter table public.payouts enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.profiles from anon,authenticated;
revoke all on public.hourly_rates from anon,authenticated;
revoke all on public.clinic_settings from anon,authenticated;
revoke all on public.extra_hours from anon,authenticated;
revoke all on public.payouts from anon,authenticated;
revoke all on public.audit_logs from anon,authenticated;

-- Não criar policies abertas: funções de servidor usam service_role protegido.
-- Para definir a proprietária, crie primeiro o usuário em Authentication > Users,
-- copie o UUID e rode o seguinte comando SUBSTITUINDO OS VALORES:
-- insert into public.profiles (id,full_name,email,role,active,must_change_password)
-- values ('UUID_DA_DONA','Nome da proprietária','dona@clinica.com.br','owner',true,false);

-- Integridade adicional: solicitações não recusadas não podem se sobrepor,
-- mesmo quando dois pedidos são enviados ao mesmo tempo.
create extension if not exists btree_gist;
alter table public.extra_hours add constraint extra_hours_no_overlap
  exclude using gist (
    worker_id with =,
    tstzrange(started_at,ended_at,'[)') with &&
  ) where (status <> 'rejected');

-- Fecha o pequeno intervalo de corrida entre a conferência do pagamento
-- e a inclusão/alteração de pedidos do mesmo prestador/período.
create or replace function public.nexa_period_of(t timestamptz)
returns text language plpgsql stable set search_path = public as $$
declare
  localdate date := (t at time zone 'America/Sao_Paulo')::date;
  closing integer;
  month_anchor date;
begin
  select closing_day into closing from public.clinic_settings where id=1;
  if closing is null then raise exception 'Configure o dia de fechamento'; end if;
  month_anchor := date_trunc('month',localdate)::date;
  if extract(day from localdate)>closing then
    month_anchor := (month_anchor + interval '1 month')::date;
  end if;
  return to_char(month_anchor,'YYYY-MM');
end; $$;

create or replace function public.nexa_lock_extra_period()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  key_new text := public.nexa_period_of(new.ended_at);
  key_old text;
begin
  if tg_op='UPDATE' then
    key_old := public.nexa_period_of(old.ended_at);
    if key_old<>key_new then
      -- Ordena as locks para evitar deadlock em alterações simultâneas.
      perform pg_advisory_xact_lock(hashtextextended('nexa-hours:'||new.worker_id::text||':'||least(key_old,key_new),0));
      perform pg_advisory_xact_lock(hashtextextended('nexa-hours:'||new.worker_id::text||':'||greatest(key_old,key_new),0));
    else
      perform pg_advisory_xact_lock(hashtextextended('nexa-hours:'||new.worker_id::text||':'||key_new,0));
    end if;
    if exists(select 1 from public.payouts where worker_id=old.worker_id and period_key=key_old) then
      raise exception 'Período já aprovado: não é possível alterar a solicitação';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('nexa-hours:'||new.worker_id::text||':'||key_new,0));
  end if;
  if exists(select 1 from public.payouts where worker_id=new.worker_id and period_key=key_new) then
    raise exception 'Período já aprovado: não é possível incluir ou alterar solicitação';
  end if;
  return new;
end; $$;

create trigger nexa_guard_extra_hours
before insert or update on public.extra_hours
for each row execute function public.nexa_lock_extra_period();

create or replace function public.nexa_guard_payout()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexa-hours:'||new.worker_id::text||':'||new.period_key,0));
  if new.period_key >= public.nexa_period_of(now()) then
    raise exception 'O fechamento ainda está aberto';
  end if;
  select count(*) into n from public.extra_hours
   where worker_id=new.worker_id and status='pending'
     and public.nexa_period_of(ended_at)=new.period_key;
  if n>0 then raise exception 'Existem solicitações pendentes'; end if;
  return new;
end; $$;

create trigger nexa_guard_payout_insert
before insert on public.payouts
for each row execute function public.nexa_guard_payout();
