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
