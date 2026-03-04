# Mailbox Swap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the `swapCampaignMailboxes` MCP tool that replaces email accounts on paused campaigns based on a CSV of mailbox addresses filtered by warmup reputation.

**Architecture:** Three-layer structure — new types in `types.ts`, five new API methods on `SmartleadClient`, and a `MailboxSwapService` orchestrating the full flow. The MCP tool in `src/mcp/index.ts` wraps the service. No test framework exists in this project; verification is done via `dryRun: true`.

**Tech Stack:** TypeScript ESM, `csv-parse/sync`, Smartlead REST API, Zod (MCP input schemas)

---

## Reference: Design Doc

`docs/plans/2026-03-02-mailbox-swap-design.md` — full parameter table, data flow, and report format. Read this before starting.

---

## Task 1: Add Types to `src/core/types.ts`

**Files:**
- Modify: `src/core/types.ts` (append to end of file)

**Step 1: Append the following types to the bottom of `src/core/types.ts`**

```typescript
// ========================================
// Mailbox Swap Types
// ========================================

export interface MailboxSwapParams {
  csvFilePath: string;
  clientId: string;
  fromDate: string;          // ISO date string
  toDate: string;            // ISO date string
  minReputation: number;
  maxReputation: number;
  activateCampaigns?: boolean;      // default false
  removeExistingMailboxes?: boolean; // default true
  dryRun?: boolean;                  // default true
}

export type CampaignSwapStatus = 'success' | 'partial_failure' | 'skipped';

export interface CampaignSwapResult {
  campaignId: number;
  campaignName: string;
  createdAt: string;
  existingMailboxCount: number;
  newMailboxCount: number;
  action: string;            // human-readable: "Replace (remove 3, add 18)" etc.
  status: CampaignSwapStatus;
  activated: boolean;
  errors: string[];
}

export interface MailboxSwapReport {
  dryRun: boolean;
  clientId: string;
  fromDate: string;
  toDate: string;
  reputationRange: { min: number; max: number };
  activateCampaigns: boolean;
  removeExistingMailboxes: boolean;
  mailboxStats: {
    totalInCsv: number;
    foundInAccount: number;
    qualified: number;
    filteredOut: number;
  };
  campaignStats: {
    pausedInRange: number;
  };
  campaigns: CampaignSwapResult[];
  summary: {
    fullySucceeded: number;
    partiallyFailed: number;
    notTouched: number;
  };
}
```

**Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add mailbox swap types"
```

---

## Task 2: Add New SmartleadClient Methods

**Files:**
- Modify: `src/core/smartleadClient.ts` — add 5 new public methods after `getCampaignEmailAccounts` (line ~245)

**Background: Existing patterns to follow**
- Read-only calls use `this.getJson<T>(path, params)` — rate-limited via `readRateLimiter`
- Write calls use `this.postJson<T>(path, body)` — rate-limited via `campaignRateLimiter`
- DELETE calls are done inline with `fetch()` + `this.campaignRateLimiter.throttle()` (see `deleteLead` pattern ~line 426)
- `buildUrl` is private — for DELETE, construct URL with `${this.baseUrl}/path?api_key=${this.apiKey}`

**Step 1: Add import for new types at top of file**

The file already imports `EmailAccount` from `./types.js`. Add to the existing import block:

```typescript
  MailboxSwapReport,  // (not needed here directly, but add these:)
  CampaignSwapResult,
```

Actually only these are needed in the client:
- No new type imports needed — the methods return primitives or `EmailAccount[]`

**Step 2: Add the 5 new methods after the closing `}` of `getCampaignEmailAccounts` (~line 245)**

```typescript
  /**
   * Get all email accounts belonging to a client
   */
  async getClientEmailAccounts(clientId: string): Promise<EmailAccount[]> {
    try {
      const params = new URLSearchParams({ client_id: clientId });
      const body = await this.getJson<EmailAccount[] | unknown>(
        `/email-accounts`,
        params,
      );
      return Array.isArray(body) ? body : [];
    } catch {
      return [];
    }
  }

  /**
   * Get warmup reputation score (0–100) for an email account.
   * Returns -1 if unavailable.
   */
  async getEmailAccountWarmupStats(accountId: number): Promise<number> {
    try {
      const body = await this.getJson<{ warmup_reputation?: number; reputation?: number } | unknown>(
        `/email-accounts/${accountId}/warmup-stats`,
        new URLSearchParams(),
      );
      if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        const rep = b['warmup_reputation'] ?? b['reputation'];
        if (typeof rep === 'number') return rep;
      }
      return -1;
    } catch {
      return -1;
    }
  }

  /**
   * Add email accounts to a campaign (bulk)
   */
  async addEmailAccountsToCampaign(
    campaignId: number,
    emailAccountIds: number[],
  ): Promise<boolean> {
    try {
      await this.postJson(
        `/campaigns/${campaignId}/email-accounts`,
        { email_account_ids: emailAccountIds },
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove email accounts from a campaign (bulk)
   */
  async removeEmailAccountsFromCampaign(
    campaignId: number,
    emailAccountIds: number[],
  ): Promise<boolean> {
    await this.campaignRateLimiter.throttle();
    const url = `${this.baseUrl}/campaigns/${campaignId}/email-accounts?api_key=${this.apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_account_ids: emailAccountIds }),
        signal: withTimeout(this.timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Set campaign status to ACTIVE or PAUSED
   */
  async updateCampaignStatus(
    campaignId: number,
    status: 'ACTIVE' | 'PAUSED',
  ): Promise<boolean> {
    try {
      await this.postJson(
        `/campaigns/${campaignId}/update-status`,
        { status },
      );
      return true;
    } catch {
      return false;
    }
  }
```

**Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**

```bash
git add src/core/smartleadClient.ts
git commit -m "feat: add mailbox swap API methods to SmartleadClient"
```

---

## Task 3: Create `MailboxSwapService`

**Files:**
- Create: `src/features/mailbox-swap/mailboxSwapService.ts`
- Create: `src/features/mailbox-swap/index.ts`

**Step 1: Create `src/features/mailbox-swap/mailboxSwapService.ts`**

```typescript
import { promises as fs } from "fs";
import { parse } from "csv-parse/sync";
import { SmartleadClient } from "../../core/smartleadClient.js";
import {
  MailboxSwapParams,
  MailboxSwapReport,
  CampaignSwapResult,
} from "../../core/types.js";

export class MailboxSwapService {
  constructor(private readonly client: SmartleadClient) {}

  async execute(params: MailboxSwapParams): Promise<MailboxSwapReport> {
    const {
      csvFilePath,
      clientId,
      fromDate,
      toDate,
      minReputation,
      maxReputation,
      activateCampaigns = false,
      removeExistingMailboxes = true,
      dryRun = true,
    } = params;

    // ── Step 1: Parse CSV ────────────────────────────────────────────────
    const csvEmails = await this.parseCsvEmails(csvFilePath);

    // ── Step 2: Look up each email in Smartlead ──────────────────────────
    const allClientAccounts = await this.client.getClientEmailAccounts(clientId);
    const accountByEmail = new Map(
      allClientAccounts.map((a) => [a.from_email.toLowerCase(), a])
    );

    const foundAccounts = csvEmails
      .map((email) => accountByEmail.get(email.toLowerCase()))
      .filter((a): a is NonNullable<typeof a> => a !== undefined);

    const notFoundCount = csvEmails.length - foundAccounts.length;
    if (notFoundCount > 0) {
      // Non-fatal: just skip missing emails
    }

    // ── Step 3: Filter by warmup reputation ─────────────────────────────
    const reputationResults = await Promise.all(
      foundAccounts.map(async (account) => {
        const rep = await this.client.getEmailAccountWarmupStats(account.id);
        return { account, reputation: rep };
      })
    );

    const qualifiedAccounts = reputationResults
      .filter(({ reputation }) => reputation >= minReputation && reputation <= maxReputation)
      .map(({ account }) => account);

    const filteredOutCount = foundAccounts.length - qualifiedAccounts.length;

    const mailboxStats = {
      totalInCsv: csvEmails.length,
      foundInAccount: foundAccounts.length,
      qualified: qualifiedAccounts.length,
      filteredOut: filteredOutCount,
    };

    if (qualifiedAccounts.length === 0) {
      return this.buildReport(params, mailboxStats, 0, [], dryRun);
    }

    const qualifiedIds = qualifiedAccounts.map((a) => a.id);

    // ── Step 4: Fetch PAUSED campaigns in date range ──────────────────────
    const allCampaigns = await this.client.listCampaigns(clientId, { pageSize: 1000 });
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const targetCampaigns = (allCampaigns.items as Array<{ id: number; name: string; status: string; created_at: string }>)
      .filter((c) => {
        if (c.status !== 'PAUSED') return false;
        const created = new Date(c.created_at);
        return created >= from && created <= to;
      });

    if (targetCampaigns.length === 0) {
      return this.buildReport(params, mailboxStats, 0, [], dryRun);
    }

    // ── Step 5: Process each campaign ────────────────────────────────────
    const campaignResults: CampaignSwapResult[] = [];

    for (const campaign of targetCampaigns) {
      const existing = await this.client.getCampaignEmailAccounts(campaign.id);
      const existingIds = existing.map((a) => a.id);

      const action = this.describeAction(
        removeExistingMailboxes,
        existingIds.length,
        qualifiedIds.length,
      );

      if (dryRun) {
        campaignResults.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          createdAt: campaign.created_at,
          existingMailboxCount: existingIds.length,
          newMailboxCount: qualifiedIds.length,
          action,
          status: 'success',
          activated: activateCampaigns,
          errors: [],
        });
        continue;
      }

      // Live execution
      const errors: string[] = [];

      if (removeExistingMailboxes && existingIds.length > 0) {
        const removed = await this.client.removeEmailAccountsFromCampaign(campaign.id, existingIds);
        if (!removed) {
          errors.push(`Failed to remove ${existingIds.length} existing mailboxes`);
        }
      }

      const added = await this.client.addEmailAccountsToCampaign(campaign.id, qualifiedIds);
      if (!added) {
        errors.push(`Failed to add ${qualifiedIds.length} new mailboxes`);
      }

      let activated = false;
      if (activateCampaigns && errors.length === 0) {
        activated = await this.client.updateCampaignStatus(campaign.id, 'ACTIVE');
        if (!activated) {
          errors.push(`Failed to activate campaign`);
        }
      }

      campaignResults.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        createdAt: campaign.created_at,
        existingMailboxCount: existingIds.length,
        newMailboxCount: qualifiedIds.length,
        action,
        status: errors.length === 0 ? 'success' : 'partial_failure',
        activated,
        errors,
      });
    }

    return this.buildReport(params, mailboxStats, targetCampaigns.length, campaignResults, dryRun);
  }

  private describeAction(
    removeExisting: boolean,
    existingCount: number,
    newCount: number,
  ): string {
    if (existingCount === 0) return `Add ${newCount}`;
    if (removeExisting) return `Replace (remove ${existingCount}, add ${newCount})`;
    return `Add ${newCount} (keep ${existingCount} existing)`;
  }

  private buildReport(
    params: MailboxSwapParams,
    mailboxStats: MailboxSwapReport['mailboxStats'],
    pausedInRange: number,
    campaigns: CampaignSwapResult[],
    dryRun: boolean,
  ): MailboxSwapReport {
    const succeeded = campaigns.filter((c) => c.status === 'success').length;
    const partialFailed = campaigns.filter((c) => c.status === 'partial_failure').length;

    return {
      dryRun,
      clientId: params.clientId,
      fromDate: params.fromDate,
      toDate: params.toDate,
      reputationRange: { min: params.minReputation, max: params.maxReputation },
      activateCampaigns: params.activateCampaigns ?? false,
      removeExistingMailboxes: params.removeExistingMailboxes ?? true,
      mailboxStats,
      campaignStats: { pausedInRange },
      campaigns,
      summary: {
        fullySucceeded: succeeded,
        partiallyFailed: partialFailed,
        notTouched: pausedInRange - campaigns.length,
      },
    };
  }

  private async parseCsvEmails(csvFilePath: string): Promise<string[]> {
    const content = await fs.readFile(csvFilePath, 'utf-8');
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (rows.length === 0) return [];

    // Auto-detect the email column (first column, or one containing "email")
    const firstRow = rows[0];
    const keys = Object.keys(firstRow);
    const emailKey =
      keys.find((k) => k.toLowerCase().includes('email')) ?? keys[0];

    return rows
      .map((r) => r[emailKey]?.trim())
      .filter((e): e is string => !!e && e.includes('@'));
  }
}
```

**Step 2: Create `src/features/mailbox-swap/index.ts`**

```typescript
export { MailboxSwapService } from "./mailboxSwapService.js";
```

**Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**

```bash
git add src/features/mailbox-swap/
git commit -m "feat: add MailboxSwapService"
```

---

## Task 4: Register MCP Tool in `src/mcp/index.ts`

**Files:**
- Modify: `src/mcp/index.ts`

**Step 1: Add import at the top of the file, after the existing feature imports**

After the last `import` line add:
```typescript
import { MailboxSwapService } from "../features/mailbox-swap/index.js";
```

**Step 2: Add the Zod schema** — insert before `async function main()`:

```typescript
const mailboxSwapSchema = z.object({
  csvFilePath: z
    .string()
    .describe("Absolute path to a CSV file containing one column of mailbox email addresses")
    .min(1, "csvFilePath is required"),
  clientId: z
    .string()
    .describe("Smartlead client ID")
    .min(1, "clientId is required"),
  fromDate: z
    .string()
    .describe("ISO date string — only affect campaigns created on or after this date (e.g. '2025-12-01')"),
  toDate: z
    .string()
    .describe("ISO date string — only affect campaigns created on or before this date (e.g. '2026-01-15')"),
  minReputation: z
    .number()
    .describe("Minimum warmup reputation score (0–100, inclusive)")
    .min(0)
    .max(100),
  maxReputation: z
    .number()
    .describe("Maximum warmup reputation score (0–100, inclusive)")
    .min(0)
    .max(100),
  activateCampaigns: z
    .boolean()
    .optional()
    .describe("If true, set each successfully-swapped campaign to ACTIVE (default: false)"),
  removeExistingMailboxes: z
    .boolean()
    .optional()
    .describe("If false, existing mailboxes are kept and new ones are added on top (default: true)"),
  dryRun: z
    .boolean()
    .optional()
    .describe("If true, preview only — no changes written to Smartlead (default: true)"),
});
type MailboxSwapInput = z.infer<typeof mailboxSwapSchema>;
```

**Step 3: Instantiate the service** — inside `main()`, after `const bulkUploadService = new BulkUploadService(client);` add:

```typescript
  const mailboxSwapService = new MailboxSwapService(client);
```

**Step 4: Register the tool** — add before the closing `server.connect(transport)` call (i.e., before `const transport = new StdioServerTransport()`):

```typescript
  server.registerTool(
    "swapCampaignMailboxes",
    {
      title: "Swap campaign mailboxes",
      description:
        "Replace or augment email accounts on paused Smartlead campaigns. " +
        "Reads a CSV of mailbox email addresses, filters by warmup reputation, " +
        "then assigns them to matching campaigns. Use dryRun: true (default) to preview before executing.",
      inputSchema: mailboxSwapSchema,
    },
    async (args: MailboxSwapInput, _extra: unknown) => {
      const report = await mailboxSwapService.execute({
        csvFilePath: args.csvFilePath,
        clientId: args.clientId,
        fromDate: args.fromDate,
        toDate: args.toDate,
        minReputation: args.minReputation,
        maxReputation: args.maxReputation,
        activateCampaigns: args.activateCampaigns,
        removeExistingMailboxes: args.removeExistingMailboxes,
        dryRun: args.dryRun,
      });

      const lines: string[] = [];
      const mode = report.dryRun ? 'DRY RUN' : 'EXECUTED';

      lines.push(`========================================`);
      lines.push(`MAILBOX SWAP [${mode}]`);
      lines.push(`========================================`);
      lines.push(`Client:              ${report.clientId}`);
      lines.push(`Date range:          ${report.fromDate} → ${report.toDate}`);
      lines.push(`Reputation range:    ${report.reputationRange.min}–${report.reputationRange.max}`);
      lines.push(`Activate:            ${report.activateCampaigns ? 'Yes' : 'No'}`);
      lines.push(`Remove existing:     ${report.removeExistingMailboxes ? 'Yes' : 'No'}`);
      lines.push(``);
      lines.push(`MAILBOXES (from CSV)`);
      lines.push(`  Total in CSV:       ${report.mailboxStats.totalInCsv}`);
      lines.push(`  Found in account:   ${report.mailboxStats.foundInAccount}`);
      lines.push(`  Qualified (${report.reputationRange.min}–${report.reputationRange.max}): ${report.mailboxStats.qualified}`);
      lines.push(`  Filtered out:       ${report.mailboxStats.filteredOut}`);
      lines.push(``);
      lines.push(`CAMPAIGNS FOUND`);
      lines.push(`  Paused in range:    ${report.campaignStats.pausedInRange}`);

      if (report.campaigns.length > 0) {
        lines.push(``);
        lines.push(`CAMPAIGN DETAILS`);
        for (const c of report.campaigns) {
          lines.push(`  [ID ${c.campaignId}] "${c.campaignName}"`);
          lines.push(`    Created:             ${new Date(c.createdAt).toLocaleDateString()}`);
          lines.push(`    Existing mailboxes:  ${c.existingMailboxCount}`);
          lines.push(`    New mailboxes:       ${c.newMailboxCount}`);
          lines.push(`    Action:              ${c.action}`);
          if (report.activateCampaigns) {
            lines.push(`    Status:              ${c.activated ? 'PAUSED → ACTIVE' : 'PAUSED (no change)'}`);
          }
          const resultIcon = c.status === 'success' ? '✅' : '⚠️';
          const resultLabel = c.status === 'success'
            ? (report.dryRun ? 'Would succeed' : 'Success')
            : 'PARTIAL FAILURE';
          lines.push(`    Result:              ${resultIcon} ${resultLabel}`);
          if (c.errors.length > 0) {
            lines.push(`    Errors:`);
            c.errors.forEach((e) => lines.push(`      - ${e}`));
          }
        }
      }

      lines.push(``);
      lines.push(`========================================`);
      lines.push(`SUMMARY`);
      lines.push(`  Campaigns fully succeeded:    ${report.summary.fullySucceeded}`);
      lines.push(`  Campaigns partially failed:   ${report.summary.partiallyFailed}`);
      lines.push(`  Campaigns not touched:        ${report.summary.notTouched}`);
      lines.push(`========================================`);
      if (report.dryRun) {
        lines.push(`[DRY RUN — re-run with dryRun: false to execute]`);
      }

      return {
        structuredContent: { ...report } as Record<string, unknown>,
        content: [{ type: "text", text: lines.join('\n') }],
      };
    },
  );
```

**Step 5: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 6: Commit**

```bash
git add src/mcp/index.ts
git commit -m "feat: register swapCampaignMailboxes MCP tool"
```

---

## Task 5: Build and Verify

**Step 1: Build**

```bash
npm run build
```
Expected: no errors in `dist/`

**Step 2: Commit build if needed**

```bash
git add dist/
git commit -m "chore: rebuild dist"
```

---

## Verification Checklist (Manual)

After implementation, test with dry run:
1. Create a test CSV with one column of mailbox email addresses
2. Call `swapCampaignMailboxes` with `dryRun: true` — confirm report shows existing mailboxes, qualified count, action labels
3. Call again with `removeExistingMailboxes: false` — confirm Action shows "Add X (keep Y existing)"
4. Call with `dryRun: false` on a safe test campaign to verify live execution
