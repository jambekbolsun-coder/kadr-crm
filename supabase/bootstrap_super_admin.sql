-- 1) First create your own user in Supabase Dashboard -> Authentication -> Users.
-- 2) Replace the email below and run this ONE statement in SQL Editor.
-- The helper refuses to run if a SUPER ADMIN already exists.
select public.bootstrap_first_super_admin('YOUR_ADMIN_EMAIL@example.com');
