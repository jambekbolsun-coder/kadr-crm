# Supabase Edge Functions

These source files match the functions already deployed to the current SMM_KADR Supabase backend.

- `invite-employee`: server-side employee invite with rollback if profile setup fails.
- `set-user-status`: employee profile/status/role/permissions update with SUPER ADMIN protection and rollback.

If you ever move to a different Supabase project, deploy both functions there with Supabase CLI. On the current backend no extra deployment is required.

The Supabase runtime supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never expose the service-role key to the Vite frontend.
