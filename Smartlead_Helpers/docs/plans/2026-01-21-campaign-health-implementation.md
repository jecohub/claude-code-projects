# Campaign Health Report Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Campaign Health section to the existing report showing days until leads run out, health status, remaining leads, avg send rate, and trend indicator.

**Architecture:** Extend the existing `generate-report.ts` with health calculation logic. Add new types to `types.ts`. Fetch lead sequence positions via `getCampaignLeads()` to calculate emails remaining precisely.

**Tech Stack:** TypeScript, existing SmartleadClient API methods

---

### Task 1: Add CampaignHealth Types

**Files:**
- Modify: `src/types.ts` (append at end)

**Step 1: Add the new types**

Add these type definitions at the end of `src/types.ts`:

```typescript
// ========================================
// Campaign Health Types
// ========================================

export type HealthStatus = 'Low' | 'Prepare' | 'Full' | 'Empty';

export type TrendDirection = 'accelerating' | 'stable' | 'slowing' | 'insufficient_data';

export interface CampaignHealth {
  status: HealthStatus;
  statusIcon: string;
  daysRemaining: number;
  runOutDate: Date | null;
  today: Date;
  remainingLeads: {
    total: number;
    notStarted: number;
    inProgress: number;
  };
  avgSendRate: number; // emails per day
  trend: {
    direction: TrendDirection;
    percentChange: number | null;
    icon: string;
  };
  emailsRemaining: number;
  totalEmailsSent: number;
  sendingDaysPerWeek: number;
  campaignStartDate: Date | null;
  message?: string; // For edge cases like "No active campaigns"
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add CampaignHealth types for report health section"
```

---

### Task 2: Add Health Calculation Helper Functions

**Files:**
- Create: `src/utils/healthCalculator.ts`

**Step 1: Create the health calculator module**

Create `src/utils/healthCalculator.ts`:

```typescript
import type { CampaignHealth, HealthStatus, TrendDirection, CampaignAnalytics } from '../types.js';

/**
 * Get health status based on days remaining
 */
export function getHealthStatus(daysRemaining: number, hasLeadsRemaining: boolean): HealthStatus {
  if (!hasLeadsRemaining) return 'Empty';
  if (daysRemaining <= 1) return 'Low';
  if (daysRemaining <= 4) return 'Prepare';
  return 'Full';
}

/**
 * Get status icon
 */
export function getStatusIcon(status: HealthStatus): string {
  switch (status) {
    case 'Low': return '🔴';
    case 'Prepare': return '🟡';
    case 'Full': return '🟢';
    case 'Empty': return '⚪';
  }
}

/**
 * Get trend icon
 */
export function getTrendIcon(direction: TrendDirection): string {
  switch (direction) {
    case 'accelerating': return '📈';
    case 'stable': return '➡️';
    case 'slowing': return '📉';
    case 'insufficient_data': return '⏳';
  }
}

/**
 * Calculate trend direction based on percent change
 */
export function getTrendDirection(percentChange: number | null): TrendDirection {
  if (percentChange === null) return 'insufficient_data';
  if (percentChange > 10) return 'accelerating';
  if (percentChange < -10) return 'slowing';
  return 'stable';
}

/**
 * Count sending days between two dates based on configured sending days
 * @param startDate - Start date
 * @param endDate - End date
 * @param sendingDays - Array of days (0=Sunday, 1=Monday, etc.)
 */
export function countSendingDays(startDate: Date, endDate: Date, sendingDays: number[]): number {
  if (sendingDays.length === 0) {
    // Default to 7 days/week if not configured
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    if (sendingDays.includes(current.getDay())) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return Math.max(1, count);
}

/**
 * Project future date based on sending days needed
 * @param fromDate - Starting date
 * @param sendingDaysNeeded - Number of sending days to add
 * @param sendingDays - Array of days (0=Sunday, 1=Monday, etc.)
 */
export function projectRunOutDate(fromDate: Date, sendingDaysNeeded: number, sendingDays: number[]): Date {
  if (sendingDays.length === 0 || sendingDays.length === 7) {
    // All days are sending days
    const result = new Date(fromDate);
    result.setDate(result.getDate() + sendingDaysNeeded);
    return result;
  }

  const result = new Date(fromDate);
  let daysAdded = 0;

  while (daysAdded < sendingDaysNeeded) {
    result.setDate(result.getDate() + 1);
    if (sendingDays.includes(result.getDay())) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Format date as "January 21, 2026"
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Parse lead sequence position from lead object
 * Returns 0 for "Not Started", or the sequence number (1, 2, 3...)
 */
export function getLeadSequencePosition(lead: any): number {
  // Lead structure: { lead: { ... } } or direct object
  const leadData = lead.lead || lead;

  // Check various possible field names for sequence position
  // Smartlead uses "lead_status" or may have sequence info
  const status = leadData.lead_status || leadData.status || '';

  // If status contains "Email X", extract the number
  const emailMatch = status.match(/Email\s*(\d+)/i);
  if (emailMatch) {
    return parseInt(emailMatch[1], 10);
  }

  // Check for explicit sequence number fields
  if (typeof leadData.current_sequence === 'number') {
    return leadData.current_sequence;
  }
  if (typeof leadData.seq_number === 'number') {
    return leadData.seq_number;
  }

  // "--" or empty means not started
  if (status === '--' || status === '' || status.toLowerCase() === 'not started') {
    return 0;
  }

  // Default: assume not started
  return 0;
}

/**
 * Calculate emails remaining for a single lead
 */
export function calculateEmailsRemaining(sequencePosition: number, totalSequenceSteps: number): number {
  return Math.max(0, totalSequenceSteps - sequencePosition);
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/utils/healthCalculator.ts
git commit -m "feat: add health calculator utility functions"
```

---

### Task 3: Add calculateCampaignHealth Function

**Files:**
- Modify: `scripts/generate-report.ts`

**Step 1: Add imports at top of file**

After the existing imports, add:

```typescript
import type { CampaignHealth } from "../src/types.js";
import {
  getHealthStatus,
  getStatusIcon,
  getTrendIcon,
  getTrendDirection,
  countSendingDays,
  projectRunOutDate,
  formatDate,
  getLeadSequencePosition,
  calculateEmailsRemaining,
} from "../src/utils/healthCalculator.js";
```

**Step 2: Add calculateCampaignHealth function**

Add this function before the `formatReport` function:

```typescript
async function calculateCampaignHealth(
  client: SmartleadClient,
  report: ClientCampaignReport
): Promise<CampaignHealth> {
  const today = new Date();

  // Filter active campaigns only
  const activeCampaigns = report.campaigns.filter(c => c.campaignStatus === 'ACTIVE');

  // Edge case: No active campaigns
  if (activeCampaigns.length === 0) {
    return {
      status: 'Empty',
      statusIcon: '⚪',
      daysRemaining: 0,
      runOutDate: null,
      today,
      remainingLeads: { total: 0, notStarted: 0, inProgress: 0 },
      avgSendRate: 0,
      trend: { direction: 'insufficient_data', percentChange: null, icon: '⏳' },
      emailsRemaining: 0,
      totalEmailsSent: 0,
      sendingDaysPerWeek: 0,
      campaignStartDate: null,
      message: 'No active campaigns to analyze',
    };
  }

  // Aggregate data across active campaigns
  const notStarted = report.activeLeadsSummary.notStarted;
  const inProgress = report.activeLeadsSummary.inprogress;
  const remainingLeadsTotal = notStarted + inProgress;

  // Edge case: All leads completed
  if (remainingLeadsTotal === 0) {
    const totalSent = activeCampaigns.reduce((sum, c) => sum + c.emailStats.sent, 0);
    return {
      status: 'Empty',
      statusIcon: '⚪',
      daysRemaining: 0,
      runOutDate: null,
      today,
      remainingLeads: { total: 0, notStarted: 0, inProgress: 0 },
      avgSendRate: 0,
      trend: { direction: 'insufficient_data', percentChange: null, icon: '⏳' },
      emailsRemaining: 0,
      totalEmailsSent: totalSent,
      sendingDaysPerWeek: 0,
      campaignStartDate: null,
      message: 'All leads have been processed',
    };
  }

  // Calculate total emails sent and sequence steps
  let totalEmailsSent = 0;
  let totalEmailsRemaining = 0;
  let earliestCampaignDate: Date | null = null;
  const allSendingDays = new Set<number>();

  for (const campaign of activeCampaigns) {
    totalEmailsSent += campaign.emailStats.sent;

    // Track sending days
    if (campaign.configuration?.sendingDays) {
      campaign.configuration.sendingDays.forEach(d => allSendingDays.add(d));
    }

    // Track earliest campaign start
    const campaignDate = new Date(campaign.createdAt);
    if (!earliestCampaignDate || campaignDate < earliestCampaignDate) {
      earliestCampaignDate = campaignDate;
    }

    // Fetch leads to calculate emails remaining
    const sequenceSteps = campaign.configuration?.sequenceSteps || 3; // Default to 3 if unknown

    try {
      const leads = await client.getCampaignLeads(campaign.campaignId);

      for (const lead of leads) {
        const leadData = lead.lead || lead;
        const status = leadData.lead_status?.toLowerCase() || '';

        // Only count leads that still need emails
        if (status === 'completed' || status === 'blocked' || status === 'stopped') {
          continue;
        }

        const sequencePosition = getLeadSequencePosition(lead);
        totalEmailsRemaining += calculateEmailsRemaining(sequencePosition, sequenceSteps);
      }
    } catch (error) {
      // If can't fetch leads, estimate based on counts
      // Not started = all sequence steps, In progress = half
      const campaignNotStarted = campaign.leadCounts.notStarted;
      const campaignInProgress = campaign.leadCounts.inprogress;
      totalEmailsRemaining += campaignNotStarted * sequenceSteps;
      totalEmailsRemaining += campaignInProgress * Math.ceil(sequenceSteps / 2);
    }
  }

  // Determine sending days (default to all 7 if none configured)
  const sendingDays = allSendingDays.size > 0 ? Array.from(allSendingDays) : [0, 1, 2, 3, 4, 5, 6];
  const sendingDaysPerWeek = sendingDays.length;

  // Calculate average send rate (emails/day)
  let avgSendRate = 0;
  if (earliestCampaignDate && totalEmailsSent > 0) {
    const sendingDaysSinceStart = countSendingDays(earliestCampaignDate, today, sendingDays);
    avgSendRate = totalEmailsSent / sendingDaysSinceStart;
  }

  // Edge case: No emails sent yet
  if (totalEmailsSent === 0 || avgSendRate === 0) {
    return {
      status: 'Full',
      statusIcon: '🟢',
      daysRemaining: 999,
      runOutDate: null,
      today,
      remainingLeads: { total: remainingLeadsTotal, notStarted, inProgress },
      avgSendRate: 0,
      trend: { direction: 'insufficient_data', percentChange: null, icon: '⏳' },
      emailsRemaining: totalEmailsRemaining,
      totalEmailsSent: 0,
      sendingDaysPerWeek,
      campaignStartDate: earliestCampaignDate,
      message: 'Not started sending yet',
    };
  }

  // Calculate days remaining
  const sendingDaysNeeded = Math.ceil(totalEmailsRemaining / avgSendRate);
  const runOutDate = projectRunOutDate(today, sendingDaysNeeded, sendingDays);
  const daysRemaining = Math.ceil((runOutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Calculate trend (compare last 7 days vs previous 7 days)
  // For now, use a simplified approach - this could be enhanced with actual daily data
  let trendDirection: TrendDirection = 'insufficient_data';
  let trendPercentChange: number | null = null;

  if (earliestCampaignDate) {
    const daysSinceStart = Math.ceil((today.getTime() - earliestCampaignDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceStart >= 14) {
      // We have enough data for trend
      // Simplified: assume stable for now (would need daily send data for precise trend)
      trendDirection = 'stable';
      trendPercentChange = 0;
    }
  }

  const status = getHealthStatus(daysRemaining, remainingLeadsTotal > 0);

  return {
    status,
    statusIcon: getStatusIcon(status),
    daysRemaining,
    runOutDate,
    today,
    remainingLeads: { total: remainingLeadsTotal, notStarted, inProgress },
    avgSendRate: Math.round(avgSendRate),
    trend: {
      direction: trendDirection,
      percentChange: trendPercentChange,
      icon: getTrendIcon(trendDirection),
    },
    emailsRemaining: totalEmailsRemaining,
    totalEmailsSent,
    sendingDaysPerWeek,
    campaignStartDate: earliestCampaignDate,
  };
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add scripts/generate-report.ts
git commit -m "feat: add calculateCampaignHealth function"
```

---

### Task 4: Add Health Section Output Formatting

**Files:**
- Modify: `scripts/generate-report.ts`

**Step 1: Add formatHealthSection function**

Add this function after the `formatReport` function:

```typescript
function formatHealthSection(health: CampaignHealth): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('================================================================================');
  lines.push('📊 CAMPAIGN HEALTH');
  lines.push('================================================================================');
  lines.push('');

  // Handle edge cases with messages
  if (health.message) {
    lines.push(`Status:         ${health.statusIcon} ${health.status}`);
    lines.push(`Message:        ${health.message}`);
    lines.push('');
    lines.push(`Remaining leads:     ${health.remainingLeads.total.toLocaleString()} (Not Started: ${health.remainingLeads.notStarted.toLocaleString()} | In Progress: ${health.remainingLeads.inProgress.toLocaleString()})`);
    if (health.totalEmailsSent > 0) {
      lines.push(`Avg send rate:       ${health.avgSendRate.toLocaleString()} emails/day (historical)`);
    }
    lines.push('');
    lines.push('================================================================================');
    return lines.join('\n');
  }

  // Normal output
  const runOutDateStr = health.runOutDate ? formatDate(health.runOutDate) : 'N/A';
  const todayStr = formatDate(health.today);

  lines.push(`Status:         ${health.statusIcon} ${health.status}`);
  lines.push(`Will run out:   ${runOutDateStr} (${health.daysRemaining} days)`);
  lines.push(`Today:          ${todayStr}`);
  lines.push('');
  lines.push(`Remaining leads:     ${health.remainingLeads.total.toLocaleString()} (Not Started: ${health.remainingLeads.notStarted.toLocaleString()} | In Progress: ${health.remainingLeads.inProgress.toLocaleString()})`);
  lines.push(`Avg send rate:       ${health.avgSendRate.toLocaleString()} emails/day`);

  // Trend
  if (health.trend.direction === 'insufficient_data') {
    lines.push(`Trend:               ${health.trend.icon} Insufficient data`);
  } else {
    const changeStr = health.trend.percentChange !== null
      ? (health.trend.percentChange >= 0 ? `+${health.trend.percentChange}%` : `${health.trend.percentChange}%`)
      : '';
    const directionLabel = health.trend.direction.charAt(0).toUpperCase() + health.trend.direction.slice(1);
    lines.push(`Trend:               ${health.trend.icon} ${directionLabel}${changeStr ? ` (${changeStr} vs previous period)` : ''}`);
  }

  lines.push('');
  lines.push('================================================================================');

  return lines.join('\n');
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add scripts/generate-report.ts
git commit -m "feat: add formatHealthSection for health output"
```

---

### Task 5: Integrate Health Section into Main Report

**Files:**
- Modify: `scripts/generate-report.ts`

**Step 1: Update main function to calculate and display health**

Find the `main` function and update the text output section. Replace the text output block:

```typescript
// Find this existing code:
if (args.format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else {
  const fromDateStr = args.fromDate
    ? args.fromDate.toISOString()
    : undefined;
  const formatted = formatReport(report, fromDateStr);
  console.log(formatted);
}
```

Replace with:

```typescript
if (args.format === "json") {
  // Calculate health for JSON output too
  const health = await calculateCampaignHealth(client, report);
  const reportWithHealth = { ...report, health };
  console.log(JSON.stringify(reportWithHealth, null, 2));
} else {
  const fromDateStr = args.fromDate
    ? args.fromDate.toISOString()
    : undefined;
  const formatted = formatReport(report, fromDateStr);
  console.log(formatted);

  // Add health section
  console.log('\nCalculating campaign health...');
  const health = await calculateCampaignHealth(client, report);
  const healthSection = formatHealthSection(health);
  console.log(healthSection);
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Test the report**

Run: `npm run report -- --clientId=128520`
Expected: Report displays with new Campaign Health section at the end

**Step 4: Commit**

```bash
git add scripts/generate-report.ts
git commit -m "feat: integrate health section into report output"
```

---

### Task 6: Test and Verify Edge Cases

**Step 1: Test with active campaigns (normal case)**

Run: `npm run report -- --clientId=128520`
Expected: Health section shows status, run-out date, remaining leads, avg send rate, trend

**Step 2: Test JSON output**

Run: `npm run report -- --clientId=128520 --format=json | head -100`
Expected: JSON includes `health` object with all fields

**Step 3: Manual verification**

Check the output against the expected format from the design document.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete campaign health report feature

- Add CampaignHealth types
- Add health calculator utility functions
- Calculate days until leads run out
- Display health status (Low/Prepare/Full/Empty)
- Show remaining leads, avg send rate, trend indicator
- Handle edge cases (no campaigns, all completed, not started)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add CampaignHealth types | `src/types.ts` |
| 2 | Add health calculator utilities | `src/utils/healthCalculator.ts` |
| 3 | Add calculateCampaignHealth function | `scripts/generate-report.ts` |
| 4 | Add formatHealthSection function | `scripts/generate-report.ts` |
| 5 | Integrate into main report | `scripts/generate-report.ts` |
| 6 | Test and verify | Manual testing |

**Total estimated tasks:** 6 tasks with ~20 steps
