-- DisputeShield tables. Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- One table per collection; each row is (id, data jsonb). PayPal stays the source of truth for
-- disputes and money; these tables hold DisputeShield's own work (snapshots, AI analyses, responses,
-- activity, payments taken through the app, merchant fulfilment facts).

create table if not exists public.ds_cases       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.ds_records     (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.ds_facts       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.ds_analyses    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.ds_submissions (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.ds_activity    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.ds_payments    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

-- Row Level Security on. A secret key (sb_secret_... / service_role) bypasses RLS and needs no policy.
-- If you can only use the publishable key (sb_publishable_... / anon), these policies let the
-- DisputeShield server read and write its own tables with it. Keep that key on the server only
-- (it is never sent to the browser); prefer a secret key in production.
do $$
declare t text;
begin
  foreach t in array array['ds_cases','ds_records','ds_facts','ds_analyses','ds_submissions','ds_activity','ds_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "disputeshield server access" on public.%I', t);
    execute format('create policy "disputeshield server access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Handy views for browsing in the Supabase table editor.
create or replace view public.ds_case_overview with (security_invoker = on) as
select c.id,
       c.data->>'reasonLabel'           as reason,
       c.data->>'status'                as status,
       c.data->'outcome'->>'code'       as outcome,
       (c.data->'amount'->>'value')::numeric as amount,
       c.data->'amount'->>'currency'    as currency,
       c.data->'buyer'->>'name'         as buyer,
       a.data->>'recommended_action'    as ai_action,
       (a.data->>'strength_score')::int as ai_score,
       (c.data->>'createdAt')::timestamptz as opened_at
from public.ds_cases c
left join public.ds_analyses a on a.id = c.id
order by opened_at desc nulls last;
