# Production QA checklist

## Already validated before packaging

- TypeScript/TSX syntax parses successfully across frontend, Vite config and Edge Functions.
- All relative imports resolve with Linux case-sensitive file names.
- `package.json`, Vercel config and GitHub Actions YAML parse successfully.
- Supabase schema is live with RLS enabled on business tables.
- Transactional project/package create+update functions were executed against the live database inside a rollback transaction and passed.
- `invite-employee` and `set-user-status` Edge Functions were deployed successfully.
- Missing foreign-key indexes identified by Supabase Advisor were added.
- SUPER ADMIN privilege rules were exercised against the live database and rolled back: ordinary admins cannot modify a SUPER ADMIN, self role-change is blocked, and another user can be promoted by SUPER ADMIN.
- Project/package transactional RPCs were tested against the live database with `ROLLBACK`, leaving no QA records behind.

## Five-minute check after a new Vercel URL is created

1. Login as SUPER ADMIN.
2. Create a temporary project and one task.
3. Open Calendar and verify the task/event appears.
4. Invite one unused test email and verify the email link opens `/reset-password` on the new Vercel domain.
5. Delete/archive the temporary business records from the UI if they are no longer needed.

Before step 4, set the new Vercel domain in Supabase **Authentication → URL Configuration** as described in the root README.
