-- NEXA VET CONTROL · Banco de dados Supabase PostgreSQL
-- Rodar no SQL Editor de um PROJETO NOVO. Não coloque dados reais na demonstração.
-- Autenticação do Supabase: NÃO liberar cadastro público.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.clinic_settings (
  id smallint primary key default 1 check (id=1),
  company_name text not null default 'Minha clínica',
  closing_day smallint not null default 25 check (closing_day between 1 and 31),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.clinic_settings(id,company_name,closing_day) values (1,'Minha clínica',25) on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('owner','finance','worker','kiosk')),
  pj_legal_name text,
  pj_cnpj text,
  hourly_rate numeric(12,2) check (hourly_rate > 0 and hourly_rate <= 100000),
  pin_hash text unique,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_fields check ((role='worker' and hourly_rate is not null and pin_hash is not null) or (role<>'worker' and hourly_rate is null and pin_hash is null))
);
create index if not exists profiles_role_idx on public.profiles(role);
create unique index if not exists profiles_pj_cnpj_unique on public.profiles(pj_cnpj) where pj_cnpj is not null;
create table if not exists public.worker_rate_history (
  id bigint generated always as identity primary key,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  hourly_rate numeric(12,2) not null check (hourly_rate > 0),
  effective_from timestamptz not null default now(),
  changed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists worker_rate_history_worker on public.worker_rate_history(worker_id,effective_from desc);


create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id),
  terminal_id uuid references public.profiles(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  started_photo_path text,
  ended_photo_path text,
  rate_snapshot numeric(12,2) not null check (rate_snapshot > 0),
  status text not null check(status in ('open','automatic','pending_review','reviewed')),
  reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interval_valid check(ended_at is null or ended_at>started_at)
);
create index if not exists work_sessions_worker_time on public.work_sessions(worker_id,started_at desc);
create unique index if not exists work_sessions_one_open_per_worker on public.work_sessions(worker_id) where ended_at is null;

-- Evita cobrar duas vezes o mesmo intervalo por registros sobrepostos.
create extension if not exists btree_gist with schema extensions;
alter table public.work_sessions
  add constraint work_sessions_no_overlap exclude using gist
  (worker_id with =, tstzrange(started_at,coalesce(ended_at,'infinity'::timestamptz),'[)') with &&);


create table if not exists public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id),
  note text not null,
  status text not null default 'open' check(status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);
create index if not exists correction_requests_worker on public.correction_requests(worker_id,created_at desc);

create table if not exists public.payment_approvals (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id),
  period_key text not null check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  hours numeric(14,4) not null check (hours>=0),
  amount numeric(14,2) not null check (amount>=0),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  unique(worker_id,period_key)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created on public.audit_logs(created_at desc);

create table if not exists public.clock_attempts (
  id bigint generated always as identity primary key,
  kiosk_id uuid references public.profiles(id),
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists clock_attempts_kiosk_time on public.clock_attempts(kiosk_id, created_at desc);

-- Qualquer cliente autenticado que consulte as tabelas diretamente recebe acesso NEGADO.
-- TODAS as operações passam pela Edge Function e verificam papéis no servidor.
-- A service_role é SOMENTE uma variável secreta da Edge Function, NUNCA do navegador.
alter table public.clinic_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.worker_rate_history enable row level security;
alter table public.work_sessions enable row level security;
alter table public.correction_requests enable row level security;
alter table public.payment_approvals enable row level security;
alter table public.audit_logs enable row level security;
alter table public.clock_attempts enable row level security;
-- Sem políticas abertas: somente service_role pode ler/gravar.

-- Inibe edição de registros de períodos com pagamento aprovado,
-- inclusive se alguém errar ao programar uma nova função privilegiada.
create or replace function public.nexa_period_key(p_timestamp timestamptz, p_day integer)
returns text language plpgsql stable set search_path=public as $$
declare v_date date; v_end integer; v_target date;
begin
 v_date=(p_timestamp at time zone 'America/Sao_Paulo')::date;
 v_end=extract(day from (date_trunc('month',v_date::timestamp) + interval '1 month - 1 day'))::integer;
 if extract(day from v_date)::integer > least(p_day,v_end) then
    v_target=(date_trunc('month',v_date::timestamp)+interval '1 month')::date;
 else
    v_target=v_date;
 end if;
 return to_char(v_target,'YYYY-MM');
end;$$;

create or replace function public.prevent_approved_changes()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_day int; v_prev text; v_next text;
begin
 select closing_day into v_day from public.clinic_settings where id=1;
 if TG_OP in ('UPDATE','DELETE') then
   v_prev=public.nexa_period_key(old.started_at,v_day);
   if exists(select 1 from public.payment_approvals a where a.worker_id=old.worker_id and a.period_key=v_prev) then
      raise exception 'Este período já foi aprovado. Registro bloqueado.';
   end if;
 end if;
 if TG_OP in ('INSERT','UPDATE') then
   v_next=public.nexa_period_key(new.started_at,v_day);
   if exists(select 1 from public.payment_approvals a where a.worker_id=new.worker_id and a.period_key=v_next) then
      raise exception 'Este período já foi aprovado. Registro bloqueado.';
   end if;
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;$$;
drop trigger if exists prevent_approved_sessions on public.work_sessions;
create trigger prevent_approved_sessions before insert or update or delete on public.work_sessions
for each row execute function public.prevent_approved_changes();

-- Não alterar o período-base de aprovações já efetuadas.
create or replace function public.prevent_closing_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.closing_day<>old.closing_day and exists(select 1 from public.payment_approvals limit 1) then
  raise exception 'Já existem pagamentos aprovados. Não é permitido mudar o dia de fechamento.';
 end if;
 return new;
end;$$;
drop trigger if exists preserve_closing_day on public.clinic_settings;
create trigger preserve_closing_day before update on public.clinic_settings
for each row execute function public.prevent_closing_change();

-- Armazenamento PRIVADO de fotos. NÃO crie políticas públicas para este bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vet-clock-photos','vet-clock-photos',false,1048576,array['image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=1048576,allowed_mime_types=array['image/jpeg'];

-- O acesso inicial da proprietária NÃO é criado automaticamente (evita senhas expostas).
-- 1. Crie usuário por Authentication > Users > Add user (e-mail e senha).
-- 2. Copie o UUID do usuário e execute o comando abaixo com dados reais:
-- insert into public.profiles(id,full_name,email,role)
-- values ('UUID_DA_USUARIA','Nome da dona','dona@clinica.com.br','owner');

-- Aprovação atômica: calcula as horas e o valor no próprio PostgreSQL.
create or replace function public.nexa_approve_payment(p_worker_id uuid,p_period_key text,p_actor_id uuid)
returns public.payment_approvals
language plpgsql security definer set search_path=public as $$
declare v_day integer; v_total int; v_pending int; v_hours numeric; v_amount numeric; v_row public.payment_approvals; v_y integer; v_m integer; v_last integer; v_close date;
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and role in ('owner','finance') and is_active) then
    raise exception 'Sem permissão para aprovar';
 end if;
 if p_period_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Período inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_worker_id::text || p_period_key,0));
 select closing_day into v_day from public.clinic_settings where id=1;
 v_y=substring(p_period_key,1,4)::integer;
 v_m=substring(p_period_key,6,2)::integer;
 v_last=extract(day from (date_trunc('month',make_date(v_y,v_m,1)::timestamp)+interval '1 month - 1 day'))::integer;
 v_close=make_date(v_y,v_m,least(v_day,v_last));
 if now() < ((v_close + 1)::timestamp at time zone 'America/Sao_Paulo') then
   raise exception 'O período ainda não foi encerrado.';
 end if;
 select count(*),
        count(*) filter(where ended_at is null or status in ('pending_review','open')),
        coalesce(sum(extract(epoch from (ended_at-started_at))/3600.0) filter(where ended_at is not null and status in ('automatic','reviewed')),0),
        coalesce(sum((extract(epoch from (ended_at-started_at))/3600.0)*rate_snapshot) filter(where ended_at is not null and status in ('automatic','reviewed')),0)
 into v_total,v_pending,v_hours,v_amount
 from public.work_sessions
 where worker_id=p_worker_id and public.nexa_period_key(started_at,v_day)=p_period_key;
 if v_total=0 then raise exception 'Não existem serviços nesse período'; end if;
 if v_pending>0 then raise exception 'Existem registros não conferidos neste período'; end if;
 insert into public.payment_approvals(worker_id,period_key,hours,amount,approved_by)
 values(p_worker_id,p_period_key,round(v_hours,4),round(v_amount,2),p_actor_id)
 returning * into v_row;
 return v_row;
end;$$;
revoke all on function public.nexa_approve_payment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.nexa_approve_payment(uuid,text,uuid) to service_role;
