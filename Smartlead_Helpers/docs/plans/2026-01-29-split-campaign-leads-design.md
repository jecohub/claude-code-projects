# Split Campaign Leads

## Purpose

Reusable script to extract uncontacted leads from a source campaign, delete them, then distribute across N new duplicated campaigns.

## Flow

1. Fetch all leads from source campaign via `getCampaignLeads()`
2. Filter to leads with `lead_status === "notStarted"` (uncontacted)
3. Validate: filtered count >= sum of all split counts
4. **DRY-RUN CHECK**: if `--dry-run`, print plan and exit
5. Delete selected leads from source campaign (one-at-a-time API, rate-limited)
6. Duplicate source campaign N times with provided names (uses existing `duplicateCampaign()`)
7. Upload each lead chunk to its respective new campaign
8. Print summary

## CLI Interface

```bash
npx tsx scripts/split-campaign-leads.ts \
  --source 2878450 \
  --splits '[{"name":"Non-Outlook Catchall 4","count":400},{"name":"Non-Outlook Catchall 5","count":400}]' \
  --dry-run
```

### Parameters

| Flag | Required | Description |
|------|----------|-------------|
| `--source` | Yes | Source campaign ID |
| `--splits` | Yes | JSON array of `{name, count}` |
| `--client-id` | No | Client ID for campaign duplication |
| `--dry-run` | No | Preview without making changes |

## New API Method

```ts
deleteLeadFromCampaign(campaignId: number, leadId: number): Promise<{ok: boolean}>
// DELETE /campaigns/{campaignId}/leads/{leadId}
```

Uses campaign operations rate limiter. Called per-lead (no bulk delete endpoint).

## Key Decisions

- Delete leads BEFORE creating new campaigns (avoids dual-contact risk)
- Random split (shuffle then slice)
- New campaigns duplicated from source (settings, schedule, sequences, UI settings)
- Lead status field: `lead_status` from the campaign leads API response
