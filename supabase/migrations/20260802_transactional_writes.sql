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
