<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SplitMate — Repo Guide

## Architecture

- **Next.js 16.2.1** App Router (TypeScript), deployed on Vercel
- **next-auth v5** (beta) with JWT strategy. `auth()` at `lib/auth.ts` reads cookies → pages are dynamically rendered
- **Prisma 7** with `@prisma/adapter-pg` — `DATABASE_URL` set programmatically in `lib/prisma.ts`, NOT in `schema.prisma`
- **Tailwind CSS v4** via `@tailwindcss/postcss` plugin
- **Auth middleware** at root `proxy.ts` protects `/dashboard/*` and `/sessions/*`

## Key scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` | Production build (use `--webpack` if SWC bindings fail) |
| `npm run lint` | ESLint (flat config at `eslint.config.mjs`) |
| `npx prisma migrate dev` | Create/test local migration |
| `npx prisma migrate deploy` | Apply migrations in production |

## Data fetching

- **No SWR / React Query** — raw `fetch()` in client components, direct Prisma queries in server components
- **Router Cache** disabled for dynamic pages (`experimental.staleTimes: { dynamic: 0 }`) — every navigation re-executes server components
- **API routes** call `revalidatePath()` after writes (expenses, sessions) to invalidate RSC payloads
- Session page polls `GET /api/sessions/[id]` every 15s + on window focus

## Business logic

- `splitRatio` (0–1) = the **creator's** share of an expense
- If `splitRatio` is null on an expense → falls back to `session.defaultSplitRatio`
- Balance = `creatorPaid - creatorShouldPay`. Positive = invitee owes creator
- Summary is **derived client-side** in `SummaryView` component (not server-rendered)

## Quirks & gotchas

- **You cannot set DB url in `schema.prisma`** — Prisma 7 requires it via driver adapter in code
- **No tests exist** — no test runner, no test files anywhere
- **No CI pipeline** — no `.github/` directory
- **Migrations are applied automatically on production deploys** — the Vercel `buildCommand` runs `node scripts/migrate-deploy.mjs` before `next build`. In production it runs `prisma migrate deploy` (and blocks the deploy if the DB is unreachable — intentional, better than shipping a client that queries missing columns); on preview/local builds it skips (DB env vars are scoped to Production). `DATABASE_URL` may be absent at build time, but `POSTGRES_URL` (direct) is reliably present and `prisma.config.ts` falls back to it.
- **Vercel cron** triggers `GET /api/cron/notify` daily at 8:00 UTC
- Push notifications require `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars; generate with `node scripts/generate-vapid-keys.mjs`
- The API route `GET /api/sessions/[id]` is called by client polling — returns same shape as Prisma query with relations
