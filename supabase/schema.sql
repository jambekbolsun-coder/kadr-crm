-- SMM KADR CRM / PostgreSQL + Supabase
-- Run once in Supabase SQL Editor before seed.sql.

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
do $$ begin create type public.system_role as enum ('super_admin','admin','employee'); exception when duplicate_object then null; end $$;
do $$ begin create type public.employee_status as enum ('active','vacation','inactive','fired','blocked'); exception when duplicate_object then null; end $$;
do $$ begin create type public.project_type as enum ('monthly','half','oneoff','custom'); exception when duplicate_object then null; end $$;
do $$ begin create type public.project_status as enum ('draft','active','paused','completed','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_status as enum ('new','in_progress','review','completed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_priority as enum ('low','medium','high','urgent'); exception when duplicate_object then null; end $$;
do $$ begin create type public.calendar_event_type as enum ('task','deadline','project','shoot','meeting','publication','ads','plan','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.transaction_type as enum ('income','expense','salary','advance'); exception when duplicate_object then null; end $$;

-- ---------- CORE TABLES ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text not null default '',
  phone text,
  job_title text,
  department_id uuid references public.departments(id) on delete set null,
  system_role public.system_role not null default 'employee',
  status public.employee_status not null default 'active',
  started_at date,
  avatar_path text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text
);

create table if not exists public.user_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allowed boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(profile_id,permission_id)
);

-- Salary is deliberately separated from profiles so RLS cannot leak it as a column.
create table if not exists public.employee_compensation (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  salary numeric(14,2) not null default 0 check (salary >= 0),
  currency text not null default 'сом',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- PACKAGES ----------
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  package_type public.project_type not null,
  price numeric(14,2) not null default 0 check(price >= 0),
  duration_days integer not null default 1 check(duration_days > 0),
  description text,
  active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  unique(package_id,label)
);

create table if not exists public.package_bonuses (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  unique(package_id,label)
);

-- ---------- PROJECTS ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  client_phone text,
  instagram text,
  comment text,
  project_type public.project_type not null default 'custom',
  package_id uuid references public.packages(id) on delete set null,
  package_name_snapshot text,
  start_date date,
  end_date date,
  status public.project_status not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- Client-specific contract price is isolated from normal project data.
create table if not exists public.project_finance (
  project_id uuid primary key references public.projects(id) on delete cascade,
  contract_price numeric(14,2) not null default 0 check(contract_price >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  done boolean not null default false,
  done_at timestamptz
);

create table if not exists public.project_bonuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  done boolean not null default false,
  done_at timestamptz
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  project_role text,
  added_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique(project_id,profile_id)
);


-- Initialize client price from the selected package even when the project manager has no Finance permission.
create or replace function public.initialize_project_finance()
returns trigger language plpgsql security definer set search_path=public as $$
declare default_price numeric(14,2):=0;
begin
  if new.package_id is not null then select price into default_price from public.packages where id=new.package_id; end if;
  insert into public.project_finance(project_id,contract_price,updated_by)
  values(new.id,coalesce(default_price,0),new.created_by)
  on conflict(project_id) do nothing;
  return new;
end $$;
drop trigger if exists initialize_project_finance_trg on public.projects;
create trigger initialize_project_finance_trg after insert on public.projects for each row execute function public.initialize_project_finance();

-- ---------- TASKS ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  project_id uuid references public.projects(id) on delete set null,
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  start_at timestamptz,
  due_at timestamptz,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'new',
  review_comment text,
  result_link text,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at is null or start_at is null or due_at >= start_at)
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check(length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  created_at timestamptz not null default now()
);

-- ---------- CALENDAR ----------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type public.calendar_event_type not null default 'other',
  project_id uuid references public.projects(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create unique index if not exists calendar_events_source_uq on public.calendar_events(source_type,source_id) where source_type is not null and source_id is not null;

create table if not exists public.calendar_event_participants (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key(event_id,profile_id)
);

-- ---------- WORK / COMMENTS / FILES ----------
create table if not exists public.work_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  project_id uuid references public.projects(id) on delete set null,
  work_date date not null default current_date,
  work_type text not null,
  description text not null,
  link text,
  file_path text,
  minutes_spent integer check(minutes_spent is null or minutes_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check(length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  created_at timestamptz not null default now()
);

-- ---------- FINANCE ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  amount numeric(14,2) not null check(amount > 0),
  paid_at date not null default current_date,
  payment_type text not null default 'Оплата клиента',
  comment text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  type public.transaction_type not null,
  amount numeric(14,2) not null check(amount > 0),
  transaction_date date not null default current_date,
  profile_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  category text,
  comment text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((type in ('salary','advance') and profile_id is not null) or type in ('income','expense'))
);

-- ---------- SYSTEM ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  object_type text,
  object_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'new' check(status in ('new','planned','doing','done','archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  period_from date not null,
  period_to date not null,
  generated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index if not exists profiles_department_idx on public.profiles(department_id,status);
create index if not exists project_members_profile_idx on public.project_members(profile_id,project_id);
create index if not exists projects_status_dates_idx on public.projects(status,start_date,end_date);
create index if not exists tasks_assignee_status_due_idx on public.tasks(assignee_id,status,due_at);
create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists calendar_events_starts_idx on public.calendar_events(starts_at);
create index if not exists calendar_events_project_idx on public.calendar_events(project_id,starts_at);
create index if not exists work_logs_profile_date_idx on public.work_logs(profile_id,work_date desc);
create index if not exists work_logs_project_date_idx on public.work_logs(project_id,work_date desc);
create index if not exists notifications_user_read_idx on public.notifications(user_id,read_at,created_at desc);
create index if not exists payments_project_date_idx on public.payments(project_id,paid_at desc);
create index if not exists transactions_date_type_idx on public.transactions(transaction_date,type);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);

-- ---------- HELPERS ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create or replace function public.account_enabled()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select p.status not in ('blocked','fired') from public.profiles p where p.id=auth.uid()),false)
$$;

create or replace function public.current_system_role()
returns public.system_role language sql stable security definer set search_path=public as $$
  select p.system_role from public.profiles p where p.id=auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select p.system_role='super_admin' and p.status not in ('blocked','fired') from public.profiles p where p.id=auth.uid()),false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select p.system_role in ('super_admin','admin') and p.status not in ('blocked','fired') from public.profiles p where p.id=auth.uid()),false)
$$;

create or replace function public.has_permission(p_code text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.account_enabled() and (public.is_super_admin() or exists(
    select 1 from public.profiles pr
    join public.user_permissions up on up.profile_id=pr.id and up.allowed=true
    join public.permissions pe on pe.id=up.permission_id
    where pr.id=auth.uid() and pr.system_role='admin' and pe.code=p_code
  ))
$$;

create or replace function public.is_project_member(p_project uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.account_enabled() and exists(select 1 from public.project_members pm where pm.project_id=p_project and pm.profile_id=p_user)
$$;

create or replace function public.can_view_project(p_project uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.account_enabled() and (public.is_project_member(p_project) or public.has_permission('manage_projects') or public.has_permission('manage_tasks') or public.has_permission('view_reports') or public.has_permission('manage_finance'))
$$;

create or replace function public.shares_project(p_other uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.account_enabled() and exists(
    select 1 from public.project_members mine join public.project_members other on other.project_id=mine.project_id
    where mine.profile_id=auth.uid() and other.profile_id=p_other
  )
$$;

create or replace function public.can_view_task(p_task uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.account_enabled() and (exists(select 1 from public.tasks t where t.id=p_task and t.assignee_id=auth.uid()) or public.has_permission('manage_tasks') or public.has_permission('view_reports'))
$$;


create or replace function public.can_view_calendar_event(p_event uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.account_enabled() and exists(
    select 1 from public.calendar_events e
    where e.id=p_event and (
      e.owner_id=auth.uid() or e.created_by=auth.uid() or
      (e.project_id is not null and public.is_project_member(e.project_id)) or
      public.has_permission('manage_tasks') or public.has_permission('manage_projects') or
      exists(select 1 from public.calendar_event_participants ep where ep.event_id=e.id and ep.profile_id=auth.uid())
    )
  )
$$;

-- ---------- AUTH PROFILE TRIGGER ----------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name,phone,job_title,department_id,system_role,status,started_at,comment)
  values(
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1)),
    nullif(new.raw_user_meta_data->>'phone',''),
    nullif(new.raw_user_meta_data->>'job_title',''),
    case when (new.raw_user_meta_data->>'department_id') ~* '^[0-9a-f-]{36}$' then (new.raw_user_meta_data->>'department_id')::uuid else null end,
    'employee',
    'active',
    case when (new.raw_user_meta_data->>'started_at') ~ '^\d{4}-\d{2}-\d{2}$' then (new.raw_user_meta_data->>'started_at')::date else current_date end,
    nullif(new.raw_user_meta_data->>'comment','')
  ) on conflict(id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- ---------- PRIVILEGE SAFETY TRIGGERS ----------
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.system_role is distinct from old.system_role then
    if not (coalesce(current_setting('smm_kadr.bootstrap',true),'')='on' and not exists(select 1 from public.profiles where system_role='super_admin'))
       and not public.is_super_admin() then raise exception 'Only SUPER ADMIN can change system roles'; end if;
    if old.system_role='super_admin' and new.system_role<>'super_admin' and (select count(*) from public.profiles where system_role='super_admin') <= 1 then
      raise exception 'Cannot demote the last SUPER ADMIN';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_privileges_trg on public.profiles;
create trigger protect_profile_privileges_trg before update on public.profiles for each row execute function public.protect_profile_privileges();


-- One-time bootstrap helper. It is intentionally NOT callable by web roles.
create or replace function public.bootstrap_first_super_admin(p_email text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare uid uuid;
begin
  if exists(select 1 from public.profiles where system_role='super_admin') then
    raise exception 'SUPER ADMIN already exists';
  end if;
  select id into uid from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if uid is null then raise exception 'Create this user in Authentication first: %',p_email; end if;
  perform set_config('smm_kadr.bootstrap','on',true);
  update public.profiles set system_role='super_admin',status='active',updated_at=now() where id=uid;
end $$;
revoke all on function public.bootstrap_first_super_admin(text) from public,anon,authenticated;


create or replace function public.protect_employee_task_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid()=old.assignee_id and not public.has_permission('manage_tasks') then
    if new.title is distinct from old.title or new.description is distinct from old.description or new.project_id is distinct from old.project_id
       or new.assignee_id is distinct from old.assignee_id or new.department_id is distinct from old.department_id or new.created_by is distinct from old.created_by
       or new.start_at is distinct from old.start_at or new.due_at is distinct from old.due_at or new.priority is distinct from old.priority then
      raise exception 'Employee cannot change task assignment or task definition';
    end if;
    if new.status is distinct from old.status then
      if not ((old.status='new' and new.status='in_progress') or (old.status='in_progress' and new.status='review')) then
        raise exception 'Invalid employee task status transition';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_employee_task_update_trg on public.tasks;
create trigger protect_employee_task_update_trg before update on public.tasks for each row execute function public.protect_employee_task_update();

-- ---------- UPDATED_AT TRIGGERS ----------
do $$
declare t text;
begin
  foreach t in array array['departments','profiles','services','packages','projects','project_finance','tasks','calendar_events','work_logs','ideas'] loop
    execute format('drop trigger if exists %I on public.%I', 'set_updated_at_'||t, t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_updated_at_'||t, t);
  end loop;
end $$;

-- ---------- NOTIFICATIONS ----------
create or replace function public.notify_project_member_added()
returns trigger language plpgsql security definer set search_path=public as $$
declare p_name text; p_type text; s date; e date;
begin
  select name,project_type::text,start_date,end_date into p_name,p_type,s,e from public.projects where id=new.project_id;
  insert into public.notifications(user_id,type,title,body,object_type,object_id)
  values(new.profile_id,'project_member','Вас добавили в новый проект',p_name||' · '||p_type||' · '||coalesce(s::text,'—')||' — '||coalesce(e::text,'—'),'project',new.project_id);
  return new;
end $$;
drop trigger if exists notify_project_member_added_trg on public.project_members;
create trigger notify_project_member_added_trg after insert on public.project_members for each row execute function public.notify_project_member_added();

create or replace function public.notify_project_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.name is distinct from old.name or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date or new.status is distinct from old.status then
    insert into public.notifications(user_id,type,title,body,object_type,object_id)
    select pm.profile_id,'project_changed','Проект изменён',new.name||' · статус: '||new.status::text,'project',new.id
    from public.project_members pm where pm.project_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists notify_project_changed_trg on public.projects;
create trigger notify_project_changed_trg after update on public.projects for each row execute function public.notify_project_changed();

create or replace function public.notify_task_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.notifications(user_id,type,title,body,object_type,object_id)
    values(new.assignee_id,'task_created','Новая задача',new.title||coalesce(' · дедлайн '||to_char(new.due_at,'DD.MM HH24:MI'),''),'task',new.id);
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status='review' then
      insert into public.notifications(user_id,type,title,body,object_type,object_id)
      values(new.created_by,'task_review','Задача отправлена на проверку',new.title,'task',new.id);
    elsif old.status='review' and new.status='in_progress' then
      insert into public.notifications(user_id,type,title,body,object_type,object_id)
      values(new.assignee_id,'task_revision','Задача возвращена на доработку',coalesce(new.review_comment,new.title),'task',new.id);
    elsif new.status='completed' then
      insert into public.notifications(user_id,type,title,body,object_type,object_id)
      values(new.assignee_id,'task_accepted','Задача принята',new.title,'task',new.id);
    end if;
  elsif new.due_at is distinct from old.due_at or new.description is distinct from old.description or new.priority is distinct from old.priority then
    insert into public.notifications(user_id,type,title,body,object_type,object_id)
    values(new.assignee_id,'task_changed','Задача изменена',new.title,'task',new.id);
  end if;
  return new;
end $$;
drop trigger if exists notify_task_changes_trg on public.tasks;
create trigger notify_task_changes_trg after insert or update on public.tasks for each row execute function public.notify_task_changes();


create or replace function public.notify_task_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; target uuid;
begin
  select * into t from public.tasks where id=new.task_id;
  target:=case when new.author_id=t.assignee_id then t.created_by else t.assignee_id end;
  if target is not null and target<>new.author_id then
    insert into public.notifications(user_id,type,title,body,object_type,object_id)
    values(target,'task_comment','Новый комментарий к задаче',left(new.body,220),'task',new.task_id);
  end if;
  return new;
end $$;
drop trigger if exists notify_task_comment_trg on public.task_comments;
create trigger notify_task_comment_trg after insert on public.task_comments for each row execute function public.notify_task_comment();

create or replace function public.notify_project_comment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(user_id,type,title,body,object_type,object_id)
  select pm.profile_id,'project_comment','Новый комментарий в проекте',left(new.body,220),'project',new.project_id
  from public.project_members pm
  where pm.project_id=new.project_id and pm.profile_id<>new.author_id;
  return new;
end $$;
drop trigger if exists notify_project_comment_trg on public.project_comments;
create trigger notify_project_comment_trg after insert on public.project_comments for each row execute function public.notify_project_comment();

-- ---------- CALENDAR SYNC ----------
create or replace function public.sync_task_calendar()
returns trigger language plpgsql security definer set search_path=public as $$
declare event_start timestamptz;
begin
  if tg_op='DELETE' then
    delete from public.calendar_events where source_type='task' and source_id=old.id;
    return old;
  end if;
  event_start:=coalesce(new.start_at,new.due_at);
  if event_start is null or new.status in ('completed','cancelled') then
    delete from public.calendar_events where source_type='task' and source_id=new.id;
    return new;
  end if;
  insert into public.calendar_events(title,description,event_type,project_id,owner_id,created_by,starts_at,ends_at,all_day,source_type,source_id)
  values(new.title,new.description,'task',new.project_id,new.assignee_id,new.created_by,event_start,new.due_at,false,'task',new.id)
  on conflict(source_type,source_id) where source_type is not null and source_id is not null
  do update set title=excluded.title,description=excluded.description,project_id=excluded.project_id,owner_id=excluded.owner_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now();
  return new;
end $$;
drop trigger if exists sync_task_calendar_trg on public.tasks;
create trigger sync_task_calendar_trg after insert or update or delete on public.tasks for each row execute function public.sync_task_calendar();

create or replace function public.sync_project_calendar()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    delete from public.calendar_events where source_type in ('project_start','project_end') and source_id=old.id;
    return old;
  end if;
  if new.start_date is not null then
    insert into public.calendar_events(title,event_type,project_id,created_by,starts_at,all_day,source_type,source_id)
    values('Старт: '||new.name,'project',new.id,new.created_by,new.start_date::timestamptz,true,'project_start',new.id)
    on conflict(source_type,source_id) where source_type is not null and source_id is not null
    do update set title=excluded.title,starts_at=excluded.starts_at,updated_at=now();
  end if;
  if new.end_date is not null then
    insert into public.calendar_events(title,event_type,project_id,created_by,starts_at,all_day,source_type,source_id)
    values('Финиш: '||new.name,'deadline',new.id,new.created_by,new.end_date::timestamptz,true,'project_end',new.id)
    on conflict(source_type,source_id) where source_type is not null and source_id is not null
    do update set title=excluded.title,starts_at=excluded.starts_at,updated_at=now();
  end if;
  return new;
end $$;
drop trigger if exists sync_project_calendar_trg on public.projects;
create trigger sync_project_calendar_trg after insert or update or delete on public.projects for each row execute function public.sync_project_calendar();

-- ---------- ACTIVITY LOG ----------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path=public as $$
declare row_id uuid; row_title text;
begin
  if tg_op='DELETE' then row_id=old.id; row_title=coalesce(to_jsonb(old)->>'name',to_jsonb(old)->>'title',to_jsonb(old)->>'full_name');
  else row_id=new.id; row_title=coalesce(to_jsonb(new)->>'name',to_jsonb(new)->>'title',to_jsonb(new)->>'full_name'); end if;
  insert into public.activity_logs(actor_id,action,entity_type,entity_id,meta)
  values(auth.uid(),tg_op,tg_table_name,row_id,jsonb_build_object('title',row_title));
  return case when tg_op='DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','packages','projects','project_members','tasks','payments','transactions','work_logs'] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', 'audit_'||t, t);
  end loop;
end $$;

-- ---------- RLS ----------
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_permissions enable row level security;
alter table public.employee_compensation enable row level security;
alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.package_bonuses enable row level security;
alter table public.projects enable row level security;
alter table public.project_finance enable row level security;
alter table public.project_items enable row level security;
alter table public.project_bonuses enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_event_participants enable row level security;
alter table public.work_logs enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_files enable row level security;
alter table public.payments enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.company_settings enable row level security;
alter table public.ideas enable row level security;
alter table public.report_exports enable row level security;

-- Departments
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using(public.account_enabled());
drop policy if exists departments_manage on public.departments;
create policy departments_manage on public.departments for all to authenticated using(public.has_permission('manage_settings')) with check(public.has_permission('manage_settings'));

-- Profiles: salary is not in this table.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(
  public.account_enabled() and (id=auth.uid() or public.shares_project(id) or public.has_permission('manage_employees') or public.has_permission('manage_projects') or public.has_permission('manage_tasks') or public.has_permission('view_reports') or public.has_permission('view_salaries'))
);
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated using(public.has_permission('manage_employees')) with check(public.has_permission('manage_employees'));

-- Permission model
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using(public.account_enabled());
drop policy if exists user_permissions_read on public.user_permissions;
create policy user_permissions_read on public.user_permissions for select to authenticated using(public.account_enabled() and (profile_id=auth.uid() or public.is_super_admin()));
drop policy if exists user_permissions_manage on public.user_permissions;
create policy user_permissions_manage on public.user_permissions for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());

-- Compensation
drop policy if exists compensation_read on public.employee_compensation;
create policy compensation_read on public.employee_compensation for select to authenticated using(public.account_enabled() and (profile_id=auth.uid() or public.has_permission('view_salaries')));
drop policy if exists compensation_manage on public.employee_compensation;
create policy compensation_manage on public.employee_compensation for all to authenticated using(public.has_permission('view_salaries')) with check(public.has_permission('view_salaries'));

-- Services
drop policy if exists services_read on public.services;
create policy services_read on public.services for select to authenticated using(public.is_admin());
drop policy if exists services_manage on public.services;
create policy services_manage on public.services for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Packages
drop policy if exists packages_read on public.packages;
create policy packages_read on public.packages for select to authenticated using(public.has_permission('manage_packages') or public.has_permission('manage_projects'));
drop policy if exists packages_manage on public.packages;
create policy packages_manage on public.packages for all to authenticated using(public.has_permission('manage_packages')) with check(public.has_permission('manage_packages'));

drop policy if exists package_items_read on public.package_items;
create policy package_items_read on public.package_items for select to authenticated using(exists(select 1 from public.packages p where p.id=package_id));
drop policy if exists package_items_manage on public.package_items;
create policy package_items_manage on public.package_items for all to authenticated using(public.has_permission('manage_packages')) with check(public.has_permission('manage_packages'));
drop policy if exists package_bonuses_read on public.package_bonuses;
create policy package_bonuses_read on public.package_bonuses for select to authenticated using(exists(select 1 from public.packages p where p.id=package_id));
drop policy if exists package_bonuses_manage on public.package_bonuses;
create policy package_bonuses_manage on public.package_bonuses for all to authenticated using(public.has_permission('manage_packages')) with check(public.has_permission('manage_packages'));

-- Projects
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated using(public.can_view_project(id));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check(public.has_permission('manage_projects') and created_by=auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using(public.has_permission('manage_projects')) with check(public.has_permission('manage_projects'));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using(public.is_super_admin());

-- Project finance is invisible without Manage Finance.
drop policy if exists project_finance_read on public.project_finance;
create policy project_finance_read on public.project_finance for select to authenticated using(public.has_permission('manage_finance'));
drop policy if exists project_finance_manage on public.project_finance;
create policy project_finance_manage on public.project_finance for all to authenticated using(public.has_permission('manage_finance')) with check(public.has_permission('manage_finance'));

-- Project scope snapshots
drop policy if exists project_items_read on public.project_items;
create policy project_items_read on public.project_items for select to authenticated using(public.can_view_project(project_id));
drop policy if exists project_items_manage on public.project_items;
create policy project_items_manage on public.project_items for all to authenticated using(public.has_permission('manage_projects')) with check(public.has_permission('manage_projects'));
drop policy if exists project_bonuses_read on public.project_bonuses;
create policy project_bonuses_read on public.project_bonuses for select to authenticated using(public.can_view_project(project_id));
drop policy if exists project_bonuses_manage on public.project_bonuses;
create policy project_bonuses_manage on public.project_bonuses for all to authenticated using(public.has_permission('manage_projects')) with check(public.has_permission('manage_projects'));

-- Project members
drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members for select to authenticated using(public.can_view_project(project_id));
drop policy if exists project_members_manage on public.project_members;
create policy project_members_manage on public.project_members for all to authenticated using(public.has_permission('manage_projects')) with check(public.has_permission('manage_projects'));

-- Tasks: an employee can read only their own task rows.
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using(public.account_enabled() and (assignee_id=auth.uid() or public.has_permission('manage_tasks') or public.has_permission('view_reports')));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check(public.has_permission('manage_tasks') and created_by=auth.uid());
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using(public.account_enabled() and (assignee_id=auth.uid() or public.has_permission('manage_tasks'))) with check(public.account_enabled() and (assignee_id=auth.uid() or public.has_permission('manage_tasks')));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated using(public.has_permission('manage_tasks'));

-- Task comments / attachments
drop policy if exists task_comments_read on public.task_comments;
create policy task_comments_read on public.task_comments for select to authenticated using(public.can_view_task(task_id));
drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments for insert to authenticated with check(author_id=auth.uid() and public.can_view_task(task_id));
drop policy if exists task_attachments_read on public.task_attachments;
create policy task_attachments_read on public.task_attachments for select to authenticated using(public.can_view_task(task_id));
drop policy if exists task_attachments_insert on public.task_attachments;
create policy task_attachments_insert on public.task_attachments for insert to authenticated with check(uploaded_by=auth.uid() and public.can_view_task(task_id));

-- Calendar
drop policy if exists calendar_events_read on public.calendar_events;
create policy calendar_events_read on public.calendar_events for select to authenticated using(public.can_view_calendar_event(id));
drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events for insert to authenticated with check(
  public.account_enabled() and created_by=auth.uid() and (
    public.has_permission('manage_tasks') or public.has_permission('manage_projects') or
    (owner_id=auth.uid() and (project_id is null or public.is_project_member(project_id)))
  )
);
drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update on public.calendar_events for update to authenticated using(public.account_enabled() and (created_by=auth.uid() or public.has_permission('manage_tasks') or public.has_permission('manage_projects'))) with check(public.account_enabled() and (created_by=auth.uid() or public.has_permission('manage_tasks') or public.has_permission('manage_projects')));
drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete on public.calendar_events for delete to authenticated using(public.account_enabled() and (created_by=auth.uid() or public.has_permission('manage_tasks') or public.has_permission('manage_projects')));

drop policy if exists event_participants_read on public.calendar_event_participants;
create policy event_participants_read on public.calendar_event_participants for select to authenticated using(public.can_view_calendar_event(event_id));
drop policy if exists event_participants_manage on public.calendar_event_participants;
create policy event_participants_manage on public.calendar_event_participants for all to authenticated using(exists(select 1 from public.calendar_events e where e.id=event_id and (e.created_by=auth.uid() or public.has_permission('manage_tasks') or public.has_permission('manage_projects')))) with check(exists(select 1 from public.calendar_events e where e.id=event_id and (e.created_by=auth.uid() or public.has_permission('manage_tasks') or public.has_permission('manage_projects'))));

-- Work logs: own logs, admins with reports, and teammates for project history.
drop policy if exists work_logs_read on public.work_logs;
create policy work_logs_read on public.work_logs for select to authenticated using(public.account_enabled() and (profile_id=auth.uid() or public.has_permission('view_reports') or (project_id is not null and public.is_project_member(project_id))));
drop policy if exists work_logs_insert on public.work_logs;
create policy work_logs_insert on public.work_logs for insert to authenticated with check(public.account_enabled() and profile_id=auth.uid() and (project_id is null or public.is_project_member(project_id)));
drop policy if exists work_logs_update on public.work_logs;
create policy work_logs_update on public.work_logs for update to authenticated using(public.account_enabled() and profile_id=auth.uid()) with check(public.account_enabled() and profile_id=auth.uid());

-- Project comments / files
drop policy if exists project_comments_read on public.project_comments;
create policy project_comments_read on public.project_comments for select to authenticated using(public.can_view_project(project_id));
drop policy if exists project_comments_insert on public.project_comments;
create policy project_comments_insert on public.project_comments for insert to authenticated with check(author_id=auth.uid() and public.can_view_project(project_id));
drop policy if exists project_files_read on public.project_files;
create policy project_files_read on public.project_files for select to authenticated using(public.can_view_project(project_id));
drop policy if exists project_files_insert on public.project_files;
create policy project_files_insert on public.project_files for insert to authenticated with check(uploaded_by=auth.uid() and public.can_view_project(project_id));

-- Finance
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated using(public.has_permission('manage_finance'));
drop policy if exists payments_manage on public.payments;
create policy payments_manage on public.payments for all to authenticated using(public.has_permission('manage_finance')) with check(public.has_permission('manage_finance'));

drop policy if exists transactions_read on public.transactions;
create policy transactions_read on public.transactions for select to authenticated using(
  public.account_enabled() and ((type in ('income','expense') and public.has_permission('manage_finance')) or
  (type in ('salary','advance') and (profile_id=auth.uid() or (public.has_permission('manage_finance') and public.has_permission('view_salaries')))))
);
drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated with check(
  created_by=auth.uid() and (
    (type in ('income','expense') and public.has_permission('manage_finance')) or
    (type in ('salary','advance') and public.has_permission('manage_finance') and public.has_permission('view_salaries'))
  )
);
drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions for update to authenticated using(public.has_permission('manage_finance') and (type in ('income','expense') or public.has_permission('view_salaries'))) with check(public.has_permission('manage_finance') and (type in ('income','expense') or public.has_permission('view_salaries')));

-- Notifications: strictly own.
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using(public.account_enabled() and user_id=auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using(public.account_enabled() and user_id=auth.uid()) with check(public.account_enabled() and user_id=auth.uid());

-- Activity log
drop policy if exists activity_logs_read on public.activity_logs;
create policy activity_logs_read on public.activity_logs for select to authenticated using(public.has_permission('view_activity_log'));

-- Company settings
drop policy if exists company_settings_read on public.company_settings;
create policy company_settings_read on public.company_settings for select to authenticated using(public.is_admin());
drop policy if exists company_settings_manage on public.company_settings;
create policy company_settings_manage on public.company_settings for all to authenticated using(public.has_permission('manage_settings')) with check(public.has_permission('manage_settings'));

-- Ideas
drop policy if exists ideas_read on public.ideas;
create policy ideas_read on public.ideas for select to authenticated using(public.is_admin());
drop policy if exists ideas_insert on public.ideas;
create policy ideas_insert on public.ideas for insert to authenticated with check(created_by=auth.uid() and public.is_admin());
drop policy if exists ideas_update on public.ideas;
create policy ideas_update on public.ideas for update to authenticated using(created_by=auth.uid() or public.is_admin()) with check(created_by=auth.uid() or public.is_admin());

-- Report export history
drop policy if exists report_exports_read on public.report_exports;
create policy report_exports_read on public.report_exports for select to authenticated using(public.account_enabled() and (profile_id=auth.uid() or public.has_permission('view_reports')));
drop policy if exists report_exports_insert on public.report_exports;
create policy report_exports_insert on public.report_exports for insert to authenticated with check(public.account_enabled() and generated_by=auth.uid() and (profile_id=auth.uid() or public.has_permission('view_reports')));

-- ---------- STORAGE ----------
insert into storage.buckets(id,name,public,file_size_limit) values
  ('avatars','avatars',false,5242880),
  ('project-files','project-files',false,52428800),
  ('task-files','task-files',false,52428800),
  ('work-files','work-files',false,52428800)
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit;

-- Private avatars: authenticated users may read, owner/admin may write.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select to authenticated using(bucket_id='avatars' and ((((storage.foldername(name))[1])::uuid=auth.uid()) or public.has_permission('manage_employees') or public.shares_project(((storage.foldername(name))[1])::uuid)));
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and public.account_enabled() and (((storage.foldername(name))[1])::uuid=auth.uid() or public.has_permission('manage_employees')));
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated using(bucket_id='avatars' and public.account_enabled() and (((storage.foldername(name))[1])::uuid=auth.uid() or public.has_permission('manage_employees')));

-- Project files: first folder is project UUID.
drop policy if exists project_storage_read on storage.objects;
create policy project_storage_read on storage.objects for select to authenticated using(bucket_id='project-files' and public.can_view_project(((storage.foldername(name))[1])::uuid));
drop policy if exists project_storage_insert on storage.objects;
create policy project_storage_insert on storage.objects for insert to authenticated with check(bucket_id='project-files' and public.can_view_project(((storage.foldername(name))[1])::uuid));

-- Task files: second folder is task UUID.
drop policy if exists task_storage_read on storage.objects;
create policy task_storage_read on storage.objects for select to authenticated using(bucket_id='task-files' and public.can_view_task(((storage.foldername(name))[2])::uuid));
drop policy if exists task_storage_insert on storage.objects;
create policy task_storage_insert on storage.objects for insert to authenticated with check(bucket_id='task-files' and ((storage.foldername(name))[1])::uuid=auth.uid() and public.can_view_task(((storage.foldername(name))[2])::uuid));

-- Work files: first folder is employee UUID. Admin reports can read.
drop policy if exists work_storage_read on storage.objects;
create policy work_storage_read on storage.objects for select to authenticated using(bucket_id='work-files' and ((((storage.foldername(name))[1])::uuid=auth.uid()) or public.has_permission('view_reports')));
drop policy if exists work_storage_insert on storage.objects;
create policy work_storage_insert on storage.objects for insert to authenticated with check(bucket_id='work-files' and public.account_enabled() and ((storage.foldername(name))[1])::uuid=auth.uid());

-- ---------- REALTIME ----------
do $$
declare t text;
begin
  foreach t in array array['notifications','tasks','projects','project_members','calendar_events'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

-- ---------- DATA API GRANTS / FUNCTION HARDENING (Supabase 2026+) ----------
-- New Supabase projects may not auto-expose public tables to the Data API.
-- Grant table operations only to authenticated users; RLS policies above still decide which rows are allowed.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- SECURITY DEFINER helpers live in public because RLS policies call them. Do not leave them executable by anon/PUBLIC.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.account_enabled() to authenticated;
grant execute on function public.current_system_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_project_member(uuid,uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.shares_project(uuid) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;
grant execute on function public.can_view_calendar_event(uuid) to authenticated;
-- bootstrap_first_super_admin intentionally remains unavailable to web roles.

-- ---------- PRIVATE RLS HELPERS / FINAL HARDENING ----------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.account_enabled()
returns boolean language sql stable security definer set search_path=public,private as $$
  select coalesce((select p.status not in ('blocked','fired') from public.profiles p where p.id=auth.uid()),false)
$$;
create or replace function private.current_system_role()
returns public.system_role language sql stable security definer set search_path=public,private as $$ select p.system_role from public.profiles p where p.id=auth.uid() $$;
create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path=public,private as $$ select coalesce((select p.system_role='super_admin' and p.status not in ('blocked','fired') from public.profiles p where p.id=auth.uid()),false) $$;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path=public,private as $$ select coalesce((select p.system_role in ('super_admin','admin') and p.status not in ('blocked','fired') from public.profiles p where p.id=auth.uid()),false) $$;
create or replace function private.has_permission(p_code text)
returns boolean language sql stable security definer set search_path=public,private as $$
  select private.account_enabled() and (private.is_super_admin() or exists(select 1 from public.profiles pr join public.user_permissions up on up.profile_id=pr.id and up.allowed=true join public.permissions pe on pe.id=up.permission_id where pr.id=auth.uid() and pr.system_role='admin' and pe.code=p_code))
$$;
create or replace function private.is_project_member(p_project uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,private as $$ select private.account_enabled() and exists(select 1 from public.project_members pm where pm.project_id=p_project and pm.profile_id=p_user) $$;
create or replace function private.can_view_project(p_project uuid)
returns boolean language sql stable security definer set search_path=public,private as $$ select private.account_enabled() and (private.is_project_member(p_project) or private.has_permission('manage_projects') or private.has_permission('manage_tasks') or private.has_permission('view_reports') or private.has_permission('manage_finance')) $$;
create or replace function private.shares_project(p_other uuid)
returns boolean language sql stable security definer set search_path=public,private as $$ select private.account_enabled() and exists(select 1 from public.project_members mine join public.project_members other on other.project_id=mine.project_id where mine.profile_id=auth.uid() and other.profile_id=p_other) $$;
create or replace function private.can_view_task(p_task uuid)
returns boolean language sql stable security definer set search_path=public,private as $$ select private.account_enabled() and (exists(select 1 from public.tasks t where t.id=p_task and t.assignee_id=auth.uid()) or private.has_permission('manage_tasks') or private.has_permission('view_reports')) $$;
create or replace function private.can_view_calendar_event(p_event uuid)
returns boolean language sql stable security definer set search_path=public,private as $$ select private.account_enabled() and exists(select 1 from public.calendar_events e where e.id=p_event and (e.owner_id=auth.uid() or e.created_by=auth.uid() or (e.project_id is not null and private.is_project_member(e.project_id)) or private.has_permission('manage_tasks') or private.has_permission('manage_projects') or exists(select 1 from public.calendar_event_participants ep where ep.event_id=e.id and ep.profile_id=auth.uid()))) $$;

grant execute on function private.account_enabled() to authenticated;
grant execute on function private.current_system_role() to authenticated;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.is_project_member(uuid,uuid) to authenticated;
grant execute on function private.can_view_project(uuid) to authenticated;
grant execute on function private.shares_project(uuid) to authenticated;
grant execute on function private.can_view_task(uuid) to authenticated;
grant execute on function private.can_view_calendar_event(uuid) to authenticated;

create or replace function public.account_enabled() returns boolean language sql stable security invoker set search_path=private,public as $$ select private.account_enabled() $$;
create or replace function public.current_system_role() returns public.system_role language sql stable security invoker set search_path=private,public as $$ select private.current_system_role() $$;
create or replace function public.is_super_admin() returns boolean language sql stable security invoker set search_path=private,public as $$ select private.is_super_admin() $$;
create or replace function public.is_admin() returns boolean language sql stable security invoker set search_path=private,public as $$ select private.is_admin() $$;
create or replace function public.has_permission(p_code text) returns boolean language sql stable security invoker set search_path=private,public as $$ select private.has_permission(p_code) $$;
create or replace function public.is_project_member(p_project uuid, p_user uuid default auth.uid()) returns boolean language sql stable security invoker set search_path=private,public as $$ select private.is_project_member(p_project,p_user) $$;
create or replace function public.can_view_project(p_project uuid) returns boolean language sql stable security invoker set search_path=private,public as $$ select private.can_view_project(p_project) $$;
create or replace function public.shares_project(p_other uuid) returns boolean language sql stable security invoker set search_path=private,public as $$ select private.shares_project(p_other) $$;
create or replace function public.can_view_task(p_task uuid) returns boolean language sql stable security invoker set search_path=private,public as $$ select private.can_view_task(p_task) $$;
create or replace function public.can_view_calendar_event(p_event uuid) returns boolean language sql stable security invoker set search_path=private,public as $$ select private.can_view_calendar_event(p_event) $$;
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.account_enabled() to authenticated;
grant execute on function public.current_system_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_project_member(uuid,uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.shares_project(uuid) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;
grant execute on function public.can_view_calendar_event(uuid) to authenticated;
-- Production hardening: transactional project creation and SUPER ADMIN safety.

create or replace function public.create_project_full(
  p_name text,
  p_client_name text,
  p_client_phone text,
  p_instagram text,
  p_comment text,
  p_project_type public.project_type,
  p_package_id uuid,
  p_package_name_snapshot text,
  p_start_date date,
  p_end_date date,
  p_contract_price numeric,
  p_items text[],
  p_bonuses text[],
  p_member_ids uuid[]
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_project_id uuid;
begin
  if not public.has_permission('manage_projects') then
    raise exception 'Access denied';
  end if;
  if nullif(trim(p_name),'') is null then
    raise exception 'Project name is required';
  end if;
  if p_start_date is null then
    raise exception 'Project start date is required';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'Project end date cannot be before start date';
  end if;

  insert into public.projects(
    name,client_name,client_phone,instagram,comment,project_type,package_id,
    package_name_snapshot,start_date,end_date,status,created_by
  ) values (
    trim(p_name),nullif(trim(p_client_name),''),nullif(trim(p_client_phone),''),
    nullif(trim(p_instagram),''),nullif(trim(p_comment),''),p_project_type,p_package_id,
    nullif(trim(p_package_name_snapshot),''),p_start_date,p_end_date,'active',auth.uid()
  ) returning id into v_project_id;

  if public.has_permission('manage_finance') then
    update public.project_finance
      set contract_price=greatest(coalesce(p_contract_price,0),0),updated_by=auth.uid()
      where project_id=v_project_id;
  end if;

  insert into public.project_items(project_id,label,sort_order)
  select v_project_id,trim(x.label),x.ord-1
  from unnest(coalesce(p_items,array[]::text[])) with ordinality as x(label,ord)
  where nullif(trim(x.label),'') is not null;

  insert into public.project_bonuses(project_id,label,sort_order)
  select v_project_id,trim(x.label),x.ord-1
  from unnest(coalesce(p_bonuses,array[]::text[])) with ordinality as x(label,ord)
  where nullif(trim(x.label),'') is not null;

  insert into public.project_members(project_id,profile_id,project_role,added_by)
  select v_project_id,p.id,p.job_title,auth.uid()
  from public.profiles p
  where p.id = any(coalesce(p_member_ids,array[]::uuid[]))
    and p.status not in ('blocked','fired')
  on conflict(project_id,profile_id) do nothing;

  return v_project_id;
end $$;

grant execute on function public.create_project_full(text,text,text,text,text,public.project_type,uuid,text,date,date,numeric,text[],text[],uuid[]) to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  active_supers integer;
begin
  -- Non-super admins must never be able to disable or change privileges of a SUPER ADMIN.
  if old.system_role='super_admin' and not public.is_super_admin() then
    if new.system_role is distinct from old.system_role or new.status is distinct from old.status then
      raise exception 'Only SUPER ADMIN can change another SUPER ADMIN';
    end if;
  end if;

  if new.system_role is distinct from old.system_role then
    if not (coalesce(current_setting('smm_kadr.bootstrap',true),'')='on' and not exists(select 1 from public.profiles where system_role='super_admin'))
       and not public.is_super_admin() then
      raise exception 'Only SUPER ADMIN can change system roles';
    end if;
  end if;

  if old.system_role='super_admin' and old.status not in ('blocked','fired')
     and (new.system_role<>'super_admin' or new.status in ('blocked','fired')) then
    select count(*) into active_supers
    from public.profiles
    where system_role='super_admin' and status not in ('blocked','fired') and id<>old.id;
    if active_supers < 1 then
      raise exception 'Cannot disable or demote the last active SUPER ADMIN';
    end if;
  end if;

  if old.id=auth.uid() and new.status in ('blocked','fired') and new.status is distinct from old.status then
    raise exception 'Cannot block or fire your own account';
  end if;

  return new;
end $$;
-- Transactional multi-table writes used by the production UI.

create or replace function public.update_project_full(
  p_project_id uuid,
  p_name text,
  p_client_name text,
  p_client_phone text,
  p_instagram text,
  p_comment text,
  p_start_date date,
  p_end_date date,
  p_status public.project_status,
  p_contract_price numeric,
  p_items jsonb,
  p_bonuses jsonb,
  p_member_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_row record;
  v_id uuid;
  v_keep_items uuid[] := array[]::uuid[];
  v_keep_bonuses uuid[] := array[]::uuid[];
begin
  if not public.has_permission('manage_projects') then raise exception 'Access denied'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Project name is required'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'Project end date cannot be before start date';
  end if;

  update public.projects set
    name=trim(p_name),
    client_name=nullif(trim(p_client_name),''),
    client_phone=nullif(trim(p_client_phone),''),
    instagram=nullif(trim(p_instagram),''),
    comment=nullif(trim(p_comment),''),
    start_date=p_start_date,
    end_date=p_end_date,
    status=p_status
  where id=p_project_id;
  if not found then raise exception 'Project not found'; end if;

  if public.has_permission('manage_finance') then
    update public.project_finance set
      contract_price=greatest(coalesce(p_contract_price,0),0),
      updated_by=auth.uid()
    where project_id=p_project_id;
  end if;

  select coalesce(array_agg((x->>'id')::uuid),array[]::uuid[]) into v_keep_items
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
  where coalesce(x->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  delete from public.project_items where project_id=p_project_id and not (id=any(v_keep_items));
  for v_row in select value,ordinality from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality loop
    if nullif(trim(v_row.value->>'label'),'') is null then continue; end if;
    if coalesce(v_row.value->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id=(v_row.value->>'id')::uuid;
      update public.project_items set label=trim(v_row.value->>'label'),sort_order=v_row.ordinality-1
      where id=v_id and project_id=p_project_id;
    else
      insert into public.project_items(project_id,label,sort_order)
      values(p_project_id,trim(v_row.value->>'label'),v_row.ordinality-1);
    end if;
  end loop;

  select coalesce(array_agg((x->>'id')::uuid),array[]::uuid[]) into v_keep_bonuses
  from jsonb_array_elements(coalesce(p_bonuses,'[]'::jsonb)) x
  where coalesce(x->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  delete from public.project_bonuses where project_id=p_project_id and not (id=any(v_keep_bonuses));
  for v_row in select value,ordinality from jsonb_array_elements(coalesce(p_bonuses,'[]'::jsonb)) with ordinality loop
    if nullif(trim(v_row.value->>'label'),'') is null then continue; end if;
    if coalesce(v_row.value->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id=(v_row.value->>'id')::uuid;
      update public.project_bonuses set label=trim(v_row.value->>'label'),sort_order=v_row.ordinality-1
      where id=v_id and project_id=p_project_id;
    else
      insert into public.project_bonuses(project_id,label,sort_order)
      values(p_project_id,trim(v_row.value->>'label'),v_row.ordinality-1);
    end if;
  end loop;

  delete from public.project_members
  where project_id=p_project_id and not (profile_id=any(coalesce(p_member_ids,array[]::uuid[])));

  insert into public.project_members(project_id,profile_id,project_role,added_by)
  select p_project_id,p.id,p.job_title,auth.uid()
  from public.profiles p
  where p.id=any(coalesce(p_member_ids,array[]::uuid[]))
    and p.status not in ('blocked','fired')
  on conflict(project_id,profile_id) do update set project_role=excluded.project_role;
end $$;

grant execute on function public.update_project_full(uuid,text,text,text,text,text,date,date,public.project_status,numeric,jsonb,jsonb,uuid[]) to authenticated;

create or replace function public.save_package_full(
  p_package_id uuid,
  p_name text,
  p_slug text,
  p_package_type public.project_type,
  p_price numeric,
  p_duration_days integer,
  p_description text,
  p_active boolean,
  p_items text[],
  p_bonuses text[]
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('manage_packages') then raise exception 'Access denied'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Package name is required'; end if;
  if nullif(trim(p_slug),'') is null then raise exception 'Package slug is required'; end if;
  if coalesce(p_duration_days,0)<1 then raise exception 'Package duration must be at least 1 day'; end if;

  if p_package_id is null then
    insert into public.packages(name,slug,package_type,price,duration_days,description,active,created_by,updated_by)
    values(trim(p_name),trim(p_slug),p_package_type,greatest(coalesce(p_price,0),0),p_duration_days,nullif(trim(p_description),''),coalesce(p_active,true),auth.uid(),auth.uid())
    returning id into v_id;
  else
    update public.packages set
      name=trim(p_name),slug=trim(p_slug),package_type=p_package_type,
      price=greatest(coalesce(p_price,0),0),duration_days=p_duration_days,
      description=nullif(trim(p_description),''),active=coalesce(p_active,true),updated_by=auth.uid()
    where id=p_package_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Package not found'; end if;
  end if;

  delete from public.package_items where package_id=v_id;
  delete from public.package_bonuses where package_id=v_id;

  insert into public.package_items(package_id,label,sort_order)
  select v_id,trim(x.label),x.ord-1
  from unnest(coalesce(p_items,array[]::text[])) with ordinality as x(label,ord)
  where nullif(trim(x.label),'') is not null;

  insert into public.package_bonuses(package_id,label,sort_order)
  select v_id,trim(x.label),x.ord-1
  from unnest(coalesce(p_bonuses,array[]::text[])) with ordinality as x(label,ord)
  where nullif(trim(x.label),'') is not null;

  return v_id;
end $$;

grant execute on function public.save_package_full(uuid,text,text,public.project_type,numeric,integer,text,boolean,text[],text[]) to authenticated;


-- 20260802_performance_indexes.sql
-- Cover foreign keys used by joins, filters and cascading updates/deletes.
-- Safe to re-run because every index is guarded with IF NOT EXISTS.

create index if not exists activity_logs_actor_idx on public.activity_logs(actor_id);
create index if not exists calendar_event_participants_profile_idx on public.calendar_event_participants(profile_id);
create index if not exists calendar_events_created_by_idx on public.calendar_events(created_by);
create index if not exists calendar_events_owner_idx on public.calendar_events(owner_id);
create index if not exists company_settings_updated_by_idx on public.company_settings(updated_by);
create index if not exists departments_created_by_idx on public.departments(created_by);
create index if not exists employee_compensation_updated_by_idx on public.employee_compensation(updated_by);
create index if not exists ideas_created_by_idx on public.ideas(created_by);
create index if not exists packages_created_by_idx on public.packages(created_by);
create index if not exists packages_updated_by_idx on public.packages(updated_by);
create index if not exists payments_created_by_idx on public.payments(created_by);
create index if not exists project_bonuses_project_idx on public.project_bonuses(project_id);
create index if not exists project_comments_author_idx on public.project_comments(author_id);
create index if not exists project_comments_project_idx on public.project_comments(project_id);
create index if not exists project_files_project_idx on public.project_files(project_id);
create index if not exists project_files_uploaded_by_idx on public.project_files(uploaded_by);
create index if not exists project_finance_updated_by_idx on public.project_finance(updated_by);
create index if not exists project_items_project_idx on public.project_items(project_id);
create index if not exists project_members_added_by_idx on public.project_members(added_by);
create index if not exists projects_created_by_idx on public.projects(created_by);
create index if not exists projects_package_idx on public.projects(package_id);
create index if not exists report_exports_generated_by_idx on public.report_exports(generated_by);
create index if not exists report_exports_profile_idx on public.report_exports(profile_id);
create index if not exists services_created_by_idx on public.services(created_by);
create index if not exists services_updated_by_idx on public.services(updated_by);
create index if not exists task_attachments_task_idx on public.task_attachments(task_id);
create index if not exists task_attachments_uploaded_by_idx on public.task_attachments(uploaded_by);
create index if not exists task_comments_author_idx on public.task_comments(author_id);
create index if not exists task_comments_task_idx on public.task_comments(task_id);
create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists tasks_department_idx on public.tasks(department_id);
create index if not exists transactions_created_by_idx on public.transactions(created_by);
create index if not exists transactions_profile_idx on public.transactions(profile_id);
create index if not exists transactions_project_idx on public.transactions(project_id);
create index if not exists user_permissions_granted_by_idx on public.user_permissions(granted_by);
create index if not exists user_permissions_permission_idx on public.user_permissions(permission_id);
-- Prevent lockout and protect SUPER ADMIN profiles from lower-privileged direct updates.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  active_supers integer;
begin
  -- A non-super administrator must not alter a SUPER ADMIN profile at all.
  if old.system_role='super_admin' and not public.is_super_admin() then
    raise exception 'Only SUPER ADMIN can modify another SUPER ADMIN';
  end if;

  -- Never allow a user to change their own system role. Another SUPER ADMIN must do it.
  if old.id=auth.uid() and new.system_role is distinct from old.system_role then
    raise exception 'Cannot change your own system role';
  end if;

  if new.system_role is distinct from old.system_role then
    if not (coalesce(current_setting('smm_kadr.bootstrap',true),'')='on' and not exists(select 1 from public.profiles where system_role='super_admin'))
       and not public.is_super_admin() then
      raise exception 'Only SUPER ADMIN can change system roles';
    end if;
  end if;

  if old.system_role='super_admin' and old.status not in ('blocked','fired')
     and (new.system_role<>'super_admin' or new.status in ('blocked','fired')) then
    select count(*) into active_supers
    from public.profiles
    where system_role='super_admin' and status not in ('blocked','fired') and id<>old.id;
    if active_supers < 1 then
      raise exception 'Cannot disable or demote the last active SUPER ADMIN';
    end if;
  end if;

  if old.id=auth.uid() and new.status in ('blocked','fired') and new.status is distinct from old.status then
    raise exception 'Cannot block or fire your own account';
  end if;

  return new;
end $$;
