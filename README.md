# SplitMate — Dépenses partagées

Application web minimaliste pour gérer les dépenses partagées en couple. Chaque utilisateur crée une session, saisit ses dépenses, invite son partenaire via un lien unique, et l'app calcule automatiquement qui doit quoi à qui.

## Stack

- **Framework** : Next.js 16 (App Router, TypeScript)
- **Auth** : NextAuth.js v5 (Google, Discord, Email/Password)
- **ORM** : Prisma 7 + `@prisma/adapter-pg`
- **DB** : Vercel Postgres (PostgreSQL)
- **UI** : Tailwind CSS + composants Radix UI
- **Deploy** : Vercel

---

## Démarrage local

### 1. Cloner et installer

```bash
git clone <repo>
cd shared-expenses
npm install
```

### 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Remplir `.env.local` :

| Variable | Description |
|---|---|
| `POSTGRES_PRISMA_URL` | URL PostgreSQL poolée (Vercel Postgres) |
| `POSTGRES_URL_NON_POOLING` | URL PostgreSQL directe (pour migrations) |
| `NEXTAUTH_SECRET` | Clé secrète — `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` en dev |
| `GOOGLE_CLIENT_ID` | OAuth Google (console.cloud.google.com) |
| `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `DISCORD_CLIENT_ID` | OAuth Discord (discord.com/developers) |
| `DISCORD_CLIENT_SECRET` | OAuth Discord |
| `CRON_SECRET` | Jeton Bearer exigé par `/api/cron/notify` (obligatoire en production : sans lui, le cron répond 500) |

### 3. Base de données

```bash
npx prisma migrate dev --name init
```

### 4. Lancer

```bash
npm run dev
```

---

## Déploiement sur Vercel

### 1. Créer le projet Vercel

```bash
npx vercel
```

### 2. Ajouter Vercel Postgres

Dans le dashboard Vercel → **Storage** → **Create Database** → **Postgres**.
Lier au projet : les variables `POSTGRES_PRISMA_URL` et `POSTGRES_URL_NON_POOLING` sont automatiquement ajoutées.

### 3. Variables d'environnement sur Vercel

Dans **Settings → Environment Variables**, ajouter :
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (ton domaine Vercel, ex: `https://splitmate.vercel.app`)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
- `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`

### 4. OAuth — URIs de redirection

**Google** (console.cloud.google.com) :
```
https://splitmate.vercel.app/api/auth/callback/google
```

**Discord** (discord.com/developers/applications) :
```
https://splitmate.vercel.app/api/auth/callback/discord
```

### 5. Migration en production

La migration s'exécute automatiquement au déploiement via le `buildCommand` dans `vercel.json`.

---

## Structure du projet

```
app/
  page.tsx                        # Landing page
  auth/signin/page.tsx            # Connexion
  auth/register/page.tsx          # Inscription
  dashboard/page.tsx              # Liste des sessions
  sessions/new/page.tsx           # Créer une session
  sessions/[id]/page.tsx          # Vue session (server)
  sessions/[id]/session-view.tsx  # Vue session (client)
  join/[code]/page.tsx            # Rejoindre via lien (server)
  join/[code]/join-client.tsx     # Page invitation (client)
  api/auth/[...nextauth]/         # NextAuth handler
  api/auth/register/              # Inscription email
  api/sessions/                   # CRUD sessions
  api/sessions/[id]/expenses/     # CRUD dépenses
  api/join/[code]/                # Rejoindre via code
lib/
  auth.ts          # Config NextAuth
  prisma.ts        # Client Prisma singleton
  calculations.ts  # Logique calcul balance
  utils.ts         # cn() utility
components/ui/
  button.tsx, input.tsx, label.tsx, card.tsx
prisma/
  schema.prisma    # Schéma DB
```

## Logique de calcul

Pour chaque dépense, un `splitRatio` (0–1) définit la **part du créateur de la session**.
- `splitRatio = 0.5` → 50/50
- `splitRatio = 0.7` → 70% créateur / 30% invité
- Si non défini sur la dépense → utilise le `defaultSplitRatio` de la session

**Balance finale** = ce que j'ai payé − ce que je devais payer = montant dû par l'autre (négatif = je dois).

## Import de relevé bancaire

Depuis une session ouverte, le bouton **Importer un relevé** accepte un fichier PDF, CSV ou TXT (4 Mo maximum, pas d'OCR). L'IA extrait les débits, ignore les crédits, soldes et totaux, puis pré-classe chaque transaction en dépense **partagée** ou **privée** à partir de l'intitulé et des 10 sessions passées les plus récentes de l'utilisateur (30 dépenses par session).

L'écran de prévisualisation reste une suggestion : chaque ligne peut être incluse ou non, éditée (libellé, montant, date) et basculée entre partagée et privée. Les doublons probables (même libellé normalisé, même montant à ±0,01 et même date) sont décochés par défaut. Rien n'est enregistré avant la confirmation.

Les dépenses privées restent visibles dans la liste mais sont exclues du solde et du résumé.

### Configuration

| Variable | Description |
|---|---|
| `OPENCODE_API_KEY` | Clé API OpenCode (obligatoire — sans elle l'import renvoie une erreur 503) |
| `OPENCODE_API_BASE_URL` | Base OpenAI-compatible (défaut : `https://opencode.ai/inference/openai/v1`) |
| `OPENCODE_MODEL` | Modèle d'extraction (défaut : `deepseek-v4.1-flash`) |

### Données envoyées à l'IA

Seul le texte du relevé est transmis à l'API OpenCode, tronqué à environ 60 000 caractères, accompagné du titre, de la devise et de la répartition de la session courante ainsi que de l'historique de classification (libellés, montants, caractère partagé/privé). Les noms des participants et le contenu du relevé ne sont jamais journalisés. Le texte est traité comme une donnée non fiable pour limiter les injections de prompt.
