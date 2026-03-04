# Mailbox Swap Feature Design

**Date:** 2026-03-02
**Status:** Approved

## Overview

Add a new MCP tool `swap-campaign-mailboxes` that replaces all email accounts (mailboxes) on a set of paused Smartlead campaigns, optionally activating those campaigns afterwards. The operator provides a CSV of mailbox email addresses and a warmup reputation range; the tool filters the mailboxes by reputation before assigning them.

## Inputs

| Parameter          | Type    | Required | Default | Description |
|--------------------|---------|----------|---------|-------------|
| `csvFilePath`      | string  | yes      | —       | Absolute path to a CSV file containing one column of mailbox email addresses |
| `clientId`         | string  | yes      | —       | Smartlead client ID |
| `fromDate`         | string  | yes      | —       | ISO date string — only affect campaigns with `created_at >= fromDate` |
| `toDate`           | string  | yes      | —       | ISO date string — only affect campaigns with `created_at <= toDate` |
| `minReputation`    | number  | yes      | —       | Minimum warmup reputation score (0–100, inclusive) |
| `maxReputation`    | number  | yes      | —       | Maximum warmup reputation score (0–100, inclusive) |
| `activateCampaigns`       | boolean | no       | false   | If true, set each successfully-swapped campaign status to ACTIVE |
| `removeExistingMailboxes` | boolean | no       | true    | If false, existing mailboxes are kept and new ones are added on top |
| `dryRun`                  | boolean | no       | true    | If true, preview only — no changes are written to Smartlead |

## Architecture

### New files

```
src/features/mailbox-swap/
  mailboxSwapService.ts   — core orchestration logic
  index.ts                — re-exports
```

### Modified files

- `src/core/smartleadClient.ts` — new API methods (see below)
- `src/mcp/index.ts` — register new MCP tool

### New SmartleadClient methods

| Method | Endpoint | Description |
|--------|----------|-------------|
| `getClientEmailAccounts(clientId)` | `GET /email-accounts?client_id=X` | List all email accounts for a client |
| `getEmailAccountWarmupStats(accountId)` | `GET /email-accounts/{id}/warmup-stats` | Fetch warmup reputation score |
| `addEmailAccountToCampaign(campaignId, emailAccountId)` | `POST /campaigns/{id}/email-accounts` | Add an email account to a campaign |
| `removeEmailAccountFromCampaign(campaignId, emailAccountId)` | `DELETE /campaigns/{id}/email-accounts/{accountId}` | Remove an email account from a campaign |
| `updateCampaignStatus(campaignId, status)` | `POST /campaigns/{id}/update-status` | Set campaign status (ACTIVE / PAUSED) |

## Data Flow

```
1. Parse CSV → extract list of email address strings

2. Look up each email in Smartlead via getClientEmailAccounts(clientId)
   → build a map: email → { id, warmup_reputation }
   → warn + skip emails not found in Smartlead

3. Fetch warmup reputation for each found account via getEmailAccountWarmupStats
   → filter: keep accounts where minReputation <= score <= maxReputation
   → if 0 accounts pass the filter, abort with clear message

4. Fetch all PAUSED campaigns for clientId where created_at ∈ [fromDate, toDate]
   → if 0 campaigns found, return early with "0 campaigns in range" message

5. For each campaign (dry run: plan only; live: execute):
   a. Fetch current email accounts
   b. If removeExistingMailboxes === true AND existing accounts > 0:
        → Remove all current email accounts
      Else:
        → Skip removal, keep existing
   c. Add all qualified mailboxes
   d. If activateCampaigns === true AND swap succeeded: set status to ACTIVE

6. Return structured report
```

## Report Format

```
========================================
MAILBOX SWAP [DRY RUN | EXECUTED]
========================================
Client:              12345
Date range:          2025-12-01 → 2026-01-15
Reputation range:    80–100
Activate:            No
Remove existing:     Yes

MAILBOXES (from CSV)
  Total in CSV:       25
  Found in account:   22
  Qualified (80–100): 18
  Filtered out:        4

CAMPAIGNS FOUND
  Paused in range:    6

CAMPAIGN DETAILS
  [ID 98765] "Swayyem - Q1 Wave 1"
    Created:             2025-12-10
    Existing mailboxes:  3
    New mailboxes:       18
    Action:              Replace (remove 3, add 18)
    Status:              PAUSED (no change)
    Result:              ✅ Success

  [ID 99001] "Swayyem - Q1 Wave 2"
    Created:             2025-12-14
    Existing mailboxes:  0
    New mailboxes:       18
    Action:              Add 18
    Status:              PAUSED → ACTIVE
    Result:              ✅ Success

  [ID 99050] "Swayyem - Q1 Wave 3"
    Created:             2025-12-20
    Existing mailboxes:  3
    New mailboxes:       18
    Action:              Add 18 (keep 3 existing)
    Status:              PAUSED (no change)
    Result:              ⚠️ PARTIAL FAILURE — added 12/18 accounts (see errors)
    Errors:
      - could not add sender6@domain.com: 429 rate limit

========================================
SUMMARY
  Campaigns fully succeeded:    5
  Campaigns partially failed:   1
  Campaigns not touched:        0
  Total mailboxes swapped:      5 campaigns × 18 accounts
========================================
[DRY RUN — re-run with dryRun: false to execute]
```

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| CSV email not found in Smartlead | Log warning, skip that email, continue |
| No mailboxes pass reputation filter | Abort early, return message |
| No PAUSED campaigns found in date range | Abort early, return message |
| Remove mailbox API failure | Mark campaign as `PARTIAL_FAILURE`, log error, still attempt remaining removes and adds |
| Add mailbox API failure (partial) | Mark campaign as `PARTIAL_FAILURE`, log error, continue other campaigns |
| Activation fails after successful swap | Mark activation as failed in report, do not retry |
| `dryRun: false` + `activateCampaigns: true` | Activation only runs if ALL mailbox adds succeeded for that campaign |

## Out of Scope

- Distribution of different mailbox subsets to different campaigns (all campaigns get the same qualified set)
- Rollback / undo of an executed swap
- Support for non-CSV inputs (e.g. plain text list)
