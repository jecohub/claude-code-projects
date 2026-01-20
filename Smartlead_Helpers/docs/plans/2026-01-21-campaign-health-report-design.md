# Campaign Health Report Feature Design

## Overview

Add a "Campaign Health" section to the existing report that shows how many days remain before a client's campaigns run out of leads, with a health status indicator.

## Output Format

```
================================================================================
📊 CAMPAIGN HEALTH
================================================================================

Status:         🟢 Full
Will run out:   February 15, 2026 (25 days)
Today:          January 21, 2026

Remaining leads:     3,847 (Not Started: 2,100 | In Progress: 1,747)
Avg send rate:       487 emails/day
Trend:               📈 Accelerating (+12% vs previous period)

================================================================================
```

### Health Status Levels

| Status | Days Left | Icon | Meaning |
|--------|-----------|------|---------|
| Low | 0-1 days | 🔴 | Urgent action needed |
| Prepare | 2-4 days | 🟡 | Start preparing new leads |
| Full | 5+ days | 🟢 | Healthy pipeline |
| Empty | 0 remaining | ⚪ | All leads processed |

### Trend Indicators

- 📈 **Accelerating** (+X%) - Sending faster than previous period
- ➡️ **Stable** - Consistent rate (within ±10%)
- 📉 **Slowing** (-X%) - Sending slower than previous period
- ⏳ **Insufficient data** - Campaign < 3 days old

## Calculation Logic

### 1. Remaining Leads
Sum all leads with status "Not Started" + "In Progress" across active campaigns for the client.

### 2. Average Send Rate (emails/day)
```
total_emails_sent ÷ actual_sending_days_since_start
```
- Only counts days when campaigns were configured to send (based on `sending_days` setting)
- Uses full historical data since campaign started

### 3. Emails Remaining to Send
For each lead, calculate emails remaining based on sequence position:
```
emails_remaining = total_sequence_steps - current_step
```
- "Not Started" leads (current_step = 0): need all sequence steps
- "In Progress" leads: need remaining steps based on actual position
- Fetch all leads to get precise sequence positions

### 4. Days Until Run Out
```
sending_days_needed = emails_remaining ÷ avg_emails_per_day
```
- Map sending days to calendar days (accounting for non-sending days)
- Add to today's date to get projected run-out date

### 5. Trend Calculation
Compare last 7 days send rate vs previous 7 days:
- Accelerating: >10% faster
- Slowing: >10% slower
- Stable: within ±10%

## Data Sources

### Existing API Calls
- `getCampaignAnalytics(campaignId)` → sent_count, campaign_lead_stats
- `getCampaignSequences(campaignId)` → total sequence steps
- `listCampaigns(clientId)` → active campaigns with created_at

### Additional Data Needed
- `campaign.schedule` → sending_days configuration
- `getCampaignLeads(campaignId)` → individual lead sequence positions

## Integration

### Placement
Added as the **last section** of the existing report output. All existing sections remain unchanged.

### Files to Modify
1. `scripts/generate-report.ts` - Add health calculation and output
2. `src/smartleadClient.ts` - Add method to fetch lead sequence positions
3. `src/types.ts` - Add types for CampaignHealth

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No active campaigns | Show "No active campaigns to analyze" |
| All leads completed | Show "Status: ⚪ Empty - All leads processed" |
| Zero emails sent yet | Show "Status: 🟢 Full - Not started sending" |
| Campaign < 3 days old | Show "Trend: ⏳ Insufficient data" |
| No sending days configured | Fall back to 7 days/week assumption |
| API fetch fails for some campaigns | Continue with available data, note partial results |

## Scope

- **Aggregated per client** - One overall health status for all active campaigns combined
- **Precise calculation** - Fetch all leads for exact sequence positions
- **Accounts for sending schedule** - Only counts configured sending days
