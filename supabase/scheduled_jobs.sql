-- Optional but recommended: deadline reminders.
-- Run after schema.sql. Supabase Cron / pg_cron must be available in the project.

create extension if not exists pg_cron with schema extensions;

create or replace function public.generate_deadline_notifications()
returns void language plpgsql security definer set search_path=public as $$
begin
  -- Deadline within the next 24h; do not duplicate the same reminder on the same calendar day.
  insert into public.notifications(user_id,type,title,body,object_type,object_id)
  select t.assignee_id,'deadline_soon','Дедлайн приближается',
         t.title||' · '||to_char(t.due_at at time zone 'Asia/Bishkek','DD.MM.YYYY HH24:MI'),
         'task',t.id
  from public.tasks t
  where t.status not in ('completed','cancelled')
    and t.due_at > now() and t.due_at <= now()+interval '24 hours'
    and not exists(
      select 1 from public.notifications n
      where n.user_id=t.assignee_id and n.type='deadline_soon' and n.object_id=t.id
        and n.created_at::date=current_date
    );

  -- Overdue tasks; one reminder per day.
  insert into public.notifications(user_id,type,title,body,object_type,object_id)
  select t.assignee_id,'task_overdue','Задача просрочена',t.title,'task',t.id
  from public.tasks t
  where t.status not in ('completed','cancelled') and t.due_at < now()
    and not exists(
      select 1 from public.notifications n
      where n.user_id=t.assignee_id and n.type='task_overdue' and n.object_id=t.id
        and n.created_at::date=current_date
    );
end $$;

-- Idempotently replace our job.
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='smm-kadr-deadline-reminders' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('smm-kadr-deadline-reminders','*/30 * * * *','select public.generate_deadline_notifications();');
end $$;

-- Cron invokes this as the database owner. Web users must not be able to call it directly.
revoke all on function public.generate_deadline_notifications() from public,anon,authenticated;
