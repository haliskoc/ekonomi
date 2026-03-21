# Company Research Studio

An MVP web app for company analysis with:

- market snapshot (Yahoo Finance)
- company news feed (Google News RSS)
- scenario commentary (OpenAI if key exists, otherwise heuristic fallback)

Important: this app provides educational commentary, not investment advice.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Server API route: `/api/company/analyze`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Optional AI setup:

```bash
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local` if you want LLM-based scenarios. Without this key, the app uses deterministic heuristic scenarios.

3. Run development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Quality Validation

Run all project checks with:

```bash
npm run validate
```

This command executes lint and production build checks in sequence.

## API Contract

Endpoint:

```txt
POST /api/company/analyze
```

Request body:

```json
{
	"symbol": "AAPL",
	"company": "Apple"
}
```

Response fields include market snapshot, latest headlines, and scenario blocks (`baseCase`, `bullCase`, `bearCase`).

## Vercel Deployment

1. Push repository to GitHub.
2. Import project in Vercel.
3. Add environment variable in Vercel Project Settings:
- `OPENAI_API_KEY` (optional)
4. Deploy.

## Custom Domain Setup

1. In Vercel Project Settings, open Domains.
2. Add your domain.
3. Apply DNS records requested by Vercel at your registrar.
4. Wait for SSL issuance and DNS propagation.

## Next Implementation Steps

- add persistent cache (Upstash Redis)
- add rate limiting middleware
- add company autocomplete list for BIST + US tickers
- add saved analyses and usage analytics
