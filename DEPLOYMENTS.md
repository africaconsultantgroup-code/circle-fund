# SikaCircle deployment split

This repository is structured for two future Vercel deployments from the same GitHub repo:

- `app.sikacircle.com` - customer app, implemented under `src/customer`
- `admin.sikacircle.com` - admin portal, implemented under `src/admin`
- `src/shared` - shared auth, role, and cross-app utilities

TanStack file routes remain in `src/routes` as thin wrappers so the current app keeps working while page implementations live in their deployment-specific areas.

The admin portal is currently available at `/admin`, `/admin/users`, and `/admin/verifications`. Admin access is guarded by `profiles.role = 'admin'` and the `public.current_user_is_admin()` database function.

When creating separate Vercel projects later, both can point at this repo. The customer deployment can route users to customer paths, while the admin deployment can use the same build and route admin users to `/admin`. A later step can add host-based redirects or deployment-specific entry points if the product needs fully separate bundles.
