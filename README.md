# KADR CRM — production package

React + Vite + TypeScript CRM connected to Supabase. This repository is prepared for a fresh GitHub repository and a fresh Vercel project.

## What is already prepared

- Vite production build (`npm run build`)
- SPA routing for Vercel through `vercel.json`
- Node/Vite-compatible runtime configuration
- Supabase Auth, RLS, Storage, Realtime and Edge Functions
- role separation: SUPER ADMIN / admin / employee
- protected salaries and project finance
- employee invitations and account status management
- projects, tasks, packages, calendar, work logs, finance, reports, ideas and settings
- transactional multi-table writes for projects/packages
- upload validation and rollback on failed database writes
- protection against disabling the last SUPER ADMIN
- private CRM is blocked from search indexing through `robots.txt`

## Local launch

Requirements: Node.js 22.

1. Copy `.env.example` to `.env`.
2. Put only these two frontend-safe values into `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

3. Run:

```bash
npm install
npm run dev
```

Never put `SUPABASE_SERVICE_ROLE_KEY` into `.env`, GitHub or Vercel frontend variables.


## Existing Supabase backend

For the current SMM_KADR Supabase project, the production migrations, indexes and both Edge Functions are already deployed. **Do not re-run `schema.sql`, migrations or Edge Function deployment just because you create a new GitHub/Vercel project.** Those files are included as source-of-truth/backup for future maintenance or migration to another Supabase project.

## Fresh GitHub repository

A short repository name is recommended: `kadr-crm`.

Upload the complete contents of this folder to the repository. `.env` is already ignored by Git; do not commit it.

The included GitHub Actions workflow runs syntax checks, unit tests and a production build on pushes and pull requests to `main`.

## Fresh Vercel project

1. In Vercel choose **Add New → Project**.
2. Import the new GitHub repository.
3. Do not manually change Build Command / Output Directory / Install Command — `vercel.json` already defines them.
4. Add two Environment Variables for **Production**, and preferably **Preview** and **Development** too:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

5. Press **Deploy**.

A short Vercel project name is recommended: `kadr-crm`.

## After the first Vercel deployment

In Supabase Dashboard open **Authentication → URL Configuration** and set:

```text
Site URL: https://YOUR-PROJECT.vercel.app
```

Add redirect URLs:

```text
https://YOUR-PROJECT.vercel.app/**
https://YOUR-PROJECT.vercel.app/reset-password
```

This is required for reliable invitation and password-recovery email links. Localhost redirect URLs may be kept additionally for development.

## Production verification

After environment variables are set, a successful deployment should pass:

```bash
npm run verify:syntax
npm run test
npm run build
```

If Vercel variables are changed after a deployment, trigger **Redeploy**, because Vite embeds `VITE_*` variables at build time.
