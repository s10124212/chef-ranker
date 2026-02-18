# Chef Ranker

A chef ranking and monitoring platform that tracks the world's top chefs across four scoring categories: Formal Accolades, Career Track, Public Signals, and Peer Standing. Built with Next.js, Prisma, and SQLite.

## Features

- **Leaderboard** -- ranked list of 53+ chefs with composite scores
- **Chef Profiles** -- detailed pages with score breakdowns, accolades, career history, and news
- **Scoring System** -- configurable weights across 4 categories with a 10-year rolling window
- **News Collection** -- automated Google News RSS fetching with taste-relevance tagging
- **Data Collectors** -- scrapers for Michelin Guide, James Beard, World's 50 Best, Instagram
- **AI Extraction** -- Claude-powered extraction of structured data from news articles
- **Outreach Drafts** -- AI-generated outreach emails for chefs
- **Monthly Snapshots** -- point-in-time ranking snapshots for tracking changes
- **Digest Emails** -- daily email digests via Resend
- **System Health** -- dashboard with infrastructure checks, scoring sanity checks, data connector health, and E2E tests
- **Compare Tool** -- side-by-side chef comparison

## Prerequisites

- Node.js 18+
- npm

## Setup

### 1. Clone and install

```bash
git clone https://github.com/s10124212/chef-ranker.git
cd chef-ranker
npm install
```

### 2. Create `.env`

```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=your-anthropic-api-key
RESEND_API_KEY=your-resend-api-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- **ANTHROPIC_API_KEY** -- required for AI outreach drafts, news AI extraction, and Michelin scraper fallback. Get one at https://console.anthropic.com
- **RESEND_API_KEY** -- required for digest emails. Get one at https://resend.com. Optional if you don't need email.

### 3. Set up the database

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Seed initial data

```bash
npm run db:seed
```

This loads 53 chefs from `data/chefs-manual.json` with their accolades, career entries, public signals, and peer standings.

### 5. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000.

## Pages

| Path | Description |
|------|-------------|
| `/` | Leaderboard with rankings and recent news |
| `/chefs` | Browse all chefs |
| `/chefs/[slug]` | Chef detail page with score breakdown |
| `/news` | News feed with taste-relevance filtering |
| `/compare` | Side-by-side chef comparison |
| `/outreach` | AI-generated outreach drafts |
| `/update` | Run data collection, news refresh, score recalculation, snapshot publishing |
| `/health` | System health dashboard, checks, and test log |
| `/archive` | Monthly ranking snapshots |
| `/settings` | Scoring weights, sender info, digest settings |

## Scoring

Each chef is scored 0-100 across four categories (default weights):

| Category | Weight | Data Sources |
|----------|--------|-------------|
| Formal Accolades | 35% | Michelin scraper, James Beard scraper, World's 50 Best scraper, News AI Extractor, manual |
| Career Track | 25% | News AI Extractor, manual |
| Public Signals | 15% | Instagram scraper, News AI Extractor, manual |
| Peer Standing | 25% | News AI Extractor, manual |

Scoring uses a **trailing 10-year window** -- only data from the last 10 years counts toward the score. Weights are configurable in Settings.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:seed` | Import chefs from `data/chefs-manual.json` |
| `npm run db:reset` | Reset database and re-run migrations |
| `npx tsx scripts/collect-data.ts` | Run all data collectors |
| `npx tsx scripts/collect-news.ts` | Fetch news from Google News RSS |

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: SQLite via Prisma ORM
- **UI**: shadcn/ui, Tailwind CSS, Lucide icons
- **AI**: Anthropic Claude (outreach generation, news extraction)
- **Email**: Resend
- **Data Collection**: Cheerio (web scraping), Axios
