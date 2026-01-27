# Smartlead_Helpers

Automation helpers for Smartlead:

1. **Reporting** — generate comprehensive client campaign reports (CLI + MCP server)
2. **Bulk upload** — CSV → split → duplicate campaigns → upload leads (with retries + duplicate detection)

**Start here:** `IMPLEMENTATION_GUIDE.md` (end-to-end overview + “how it works” for re-implementation).

## Docs map

- **`OVERVIEW.md`** — operator-first overview (what it does + how to run it) + developer code map
- **`IMPLEMENTATION_GUIDE.md`** — full architecture + reporting + bulk upload + cloning details
- **`GETTING-STARTED.md`** — bulk upload quickstart
- **`UI-SETTINGS-CONFIG.md`** — UI-only settings (AI categorisation, bounce protection, OOO)
- **`CAMPAIGN-SETTINGS-REFERENCE.md`** — what’s copyable via public API vs UI/GraphQL

---

## Reporting

Two ways to generate comprehensive Smartlead campaign reports:

1. **Standalone CLI Script** (Recommended) - Zero-cost command-line tool that generates detailed campaign reports without consuming MCP credits
2. **MCP Server** - Model Context Protocol server for integration with Claude and other AI assistants

Both methods provide identical campaign analytics including lead status breakdowns, email statistics, and per-campaign details.

## Prerequisites
- Node.js 18+
- Smartlead API key
 - Smartlead API base URL (defaults to `https://server.smartlead.ai/api/v1`, see [official docs](https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation))

## Setup
1. Copy env template and add your key:
   ```bash
   cp .env.example .env
   ```
   If `.env.example` isn’t present, use:
   ```bash
   cp env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in dev (stdio transport):
   ```bash
   npm run dev
   ```

## Lead ledger (retargeting / “what have we already sent?”)

Smartlead exports add system columns (status, IDs, timestamps, etc.), so they’re not a reliable “copy of what you uploaded”.

This repo solves that by maintaining a **local SQLite lead ledger** as the source of truth:

- Records **which emails** were uploaded to **which campaign** and **when**
- Stores the **original CSV row JSON** so you can export a clean retarget CSV later

### How it works
- **Script-based uploads** (bulk upload): automatically logged after each campaign upload.
- **Manual Smartlead UI uploads**: run a one-liner to record the same CSV you uploaded.

### Commands
```bash
# 1) Initialize the DB (optional; auto-created on first write)
npm run ledger:init

# 1b) (Optional) Import your Smartlead client list (clientId → clientName) into the DB
# Uses ./data/clients.tsv by default (tab-separated), if present.
npm run ledger:clients

# 2) Record a manual UI upload (keeps ledger complete when you upload in the Smartlead UI)
npm run ledger:record -- --campaignId=2818135 --campaignName="My Campaign" --csv="/path/to/uploaded.csv"

# 3) Export retarget-ready leads (default: 90 days since last upload)
npm run ledger:export -- --days=90 --out="./exports/retarget.csv"

# Optional: export only leads last uploaded under a specific Smartlead client
npm run ledger:export -- --days=90 --clientId=128520 --out="./exports/retarget.csv"

# Optional: export only leads last uploaded to a specific campaign
npm run ledger:export -- --days=90 --campaignId=2818135 --out="./exports/retarget.csv"
```

### Config
- Set `LEAD_LEDGER_DB_PATH` (optional). Default: `./data/lead-ledger.sqlite` (relative to `Smartlead_Helpers`).

## Standalone CLI Usage (No MCP Required)

For a zero-cost alternative that doesn't consume MCP credits, use the standalone CLI script:

### Basic Usage

```bash
# Generate campaign report for a client
npm run report -- --clientId=128520

# With date filter (campaigns from specific date onwards)
npm run report -- --clientId=128520 --from="2025-12-17"

# JSON output (for programmatic use)
npm run report -- --clientId=128520 --format=json > report.json

# Direct execution without npm
node --loader ts-node/esm scripts/generate-report.ts --clientId=128520
```

### CLI Options

- `--clientId=<ID>` (Required) - Smartlead client ID
- `--from=<ISO_DATE>` (Optional) - Filter campaigns from this date onwards
  - Example: `--from="2025-12-17T00:00:00Z"` or `--from="2025-12-17"`
- `--format=<text|json>` (Optional) - Output format (default: text)

### Report Output

The CLI generates comprehensive campaign reports including:
- Overall campaign statistics (all leads)
- Active leads breakdown (excluding completed)
- Numbered list of active campaigns
- Numbered list of paused campaigns
- Email statistics (sent, opened, clicked, replied, bounced)
- Per-campaign detailed breakdown with configurations

### Scheduling with Cron

You can automate report generation using cron:

```bash
# Daily report at 9 AM
0 9 * * * cd /path/to/Smartlead_Helpers && npm run report -- --clientId=128520 > /path/to/reports/daily-$(date +\%Y-\%m-\%d).txt 2>&1
```

## MCP wiring example
Claude / MCP client config (stdio):
```json
{
  "mcpServers": {
    "smartlead": {
      "command": "npm",
      "args": ["run", "dev"],
      "env": {
        "SMARTLEAD_API_KEY": "your-key",
        "SMARTLEAD_BASE_URL": "https://server.smartlead.ai/api/v1"
      }
    }
  }
}
```

## Smartlead API notes

- The server calls `https://server.smartlead.ai/api/v1/client/{clientId}/leads` and `/campaigns`, attaching `?api_key=<key>` per [Smartlead docs](https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation).
- Override the defaults via `SMARTLEAD_BASE_URL` and `SMARTLEAD_TIMEOUT_MS` in your environment.

## Tools

### getClientStatus
- **input**: `{ "clientId": "12345" }`
- **output**: `{ clientId, totals: { leads, uncontactedLeads, pausedCampaigns }, meta }`

Summarizes lead and campaign counts for a client.

### getLeadStatusBreakdown
- **input**: `{ "clientId": "12345" }`
- **output**: `{ clientId, totalLeads, statusBreakdown: { status: count }, meta }`

Returns a breakdown of all leads grouped by their status (e.g., contacted, replied, bounced, etc.).

The client uses `/client/{id}/leads` and `/campaigns` with `status` filters on top of the configured base URL. If your Smartlead workspace uses different paths or pagination shapes, adjust `src/smartleadClient.ts`.

## Local testing (without Claude)

- Start the MCP server + call `getClientStatus` in one go:

  ```bash
  SMARTLEAD_API_KEY=your-key \
    SMARTLEAD_BASE_URL=https://server.smartlead.ai/api/v1 \
    npm run local-call 12659923
  ```

  The script spawns `npm run dev`, waits for the server to announce its tool list, and then issues a one-shot `getClientStatus`. The response is logged as JSON (including `structuredContent` and the human-readable `content` text block).

- You can also omit the `clientId` argument if you set `SMARTLEAD_CLIENT_ID` in your environment instead.

## Project structure
- `src/index.ts` — MCP server entry, registers the tool
- `src/config.ts` — env config
- `src/smartleadClient.ts` — Smartlead API wrapper and aggregation
- `src/types.ts` — shared types for responses

## Notes
- `SMARTLEAD_TIMEOUT_MS` (optional) controls request timeout (default 15s).
- Responses may be marked `partial` with notes when an endpoint fails or lacks totals; refine mappings as you confirm your Smartlead API responses.

