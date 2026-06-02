# Supabase Integration Guide for SikaCircle

This repository is prepared for backend integration with Supabase. The UI remains unchanged; these files provide typed helpers, schema structure, and environment examples for authentication, users, circles, members, contributions, payouts, and transaction records.

## Environment Variables

Add the following values to your local `.env` or your deployment environment:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=pk.eyJ...your-public-anon-key...

# Optional server-side values for secure backend services
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

> Do not commit secret keys such as `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET`.

## Prepared Files

- `src/lib/supabase.ts` — Supabase client initialization with typed configuration.
- `src/lib/supabase-types.ts` — Public schema definitions for Supabase tables and enums.
- `src/lib/auth.ts` — Auth helpers for sign-in, sign-up, session lookup, and profile access.
- `src/lib/db.ts` — Table-level helper methods for circles, members, contributions, payouts, and transactions.

## Recommended Schema

The following SQL is ready to apply in Supabase SQL Editor or migration tooling.

```sql
create type circle_status as enum ('active', 'paused', 'completed', 'cancelled');
create type member_status as enum ('active', 'pending', 'left', 'removed');
create type contribution_status as enum ('pending', 'processed', 'failed');
create type payout_status as enum ('pending', 'completed', 'failed');
create type transaction_type as enum ('contribution', 'payout', 'refund', 'fee', 'adjustment');
create type transaction_status as enum ('pending', 'completed', 'failed');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  goal_amount numeric,
  contribution_amount numeric,
  frequency text,
  start_date timestamptz,
  end_date timestamptz,
  status circle_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status member_status not null default 'pending',
  joined_at timestamptz not null default now(),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  contribution_date timestamptz not null default now(),
  method text,
  status contribution_status not null default 'pending',
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  payout_date timestamptz not null default now(),
  status payout_status not null default 'pending',
  method text,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references circles(id),
  type transaction_type not null,
  amount numeric not null,
  currency text not null default 'GHS',
  status transaction_status not null default 'pending',
  description text,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index on circle_members(circle_id);
create index on circle_members(user_id);
create index on contributions(circle_id);
create index on contributions(user_id);
create index on payouts(circle_id);
create index on payouts(user_id);
create index on transactions(user_id);
create index on transactions(circle_id);
```

## Notes

- Use Supabase Auth for user authentication, and keep a separate `profiles` table for application metadata such as full name, phone, and avatar URL.
- `src/lib/db.ts` is intentionally lightweight and ready for future API wiring in both client and server contexts.
- `@supabase/supabase-js` should be installed before using the integration helpers.
