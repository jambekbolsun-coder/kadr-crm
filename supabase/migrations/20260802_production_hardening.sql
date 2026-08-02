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
