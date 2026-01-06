# Smartlead MCP Server

Model Context Protocol (MCP) server for Smartlead. Exposes a `getClientStatus` tool that summarizes a client's lead totals, uncontacted leads, and paused campaigns.

## Prerequisites
- Node.js 18+
- Smartlead API key
 - Smartlead API base URL (defaults to `https://server.smartlead.ai/api/v1`, see [official docs](https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation))

## Setup
1. Copy env template and add your key:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in dev (stdio transport):
   ```bash
   npm run dev
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

## Project structure
- `src/index.ts` — MCP server entry, registers the tool
- `src/config.ts` — env config
- `src/smartleadClient.ts` — Smartlead API wrapper and aggregation
- `src/types.ts` — shared types for responses

## Notes
- `SMARTLEAD_TIMEOUT_MS` (optional) controls request timeout (default 15s).
- Responses may be marked `partial` with notes when an endpoint fails or lacks totals; refine mappings as you confirm your Smartlead API responses.

