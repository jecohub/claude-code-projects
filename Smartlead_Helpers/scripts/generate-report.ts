import { getConfig } from "../src/config.js";
import { SmartleadClient } from "../src/smartleadClient.js";
import type { ClientCampaignReport } from "../src/types.js";
import type { CampaignHealth, TrendDirection } from "../src/types.js";
import {
  getHealthStatus,
  getStatusIcon,
  getTrendIcon,
  countSendingDays,
  projectRunOutDate,
  formatDate,
  getLeadSequencePosition,
  calculateEmailsRemaining,
} from "../src/utils/healthCalculator.js";

interface CliArgs {
  clientId?: string;
  fromDate?: Date;
  format: "text" | "json";
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  const clientId = args
    .find((a) => a.startsWith("--clientId="))
    ?.split("=")[1];

  const fromDateStr = args
    .find((a) => a.startsWith("--from="))
    ?.split("=")[1];

  const format = args
    .find((a) => a.startsWith("--format="))
    ?.split("=")[1] as "text" | "json" | undefined;

  const fromDate = fromDateStr ? new Date(fromDateStr) : undefined;

  return {
    clientId,
    fromDate,
    format: format || "text",
  };
}

async function calculateCampaignHealth(
  client: SmartleadClient,
  report: ClientCampaignReport
): Promise<CampaignHealth> {
  const today = new Date();
  const activeCampaigns = report.campaigns.filter(c => c.campaignStatus === 'ACTIVE');

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

  const notStarted = report.activeLeadsSummary.notStarted;
  const inProgress = report.activeLeadsSummary.inprogress;
  const remainingLeadsTotal = notStarted + inProgress;

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

  let totalEmailsSent = 0;
  let totalEmailsRemaining = 0;
  let earliestCampaignDate: Date | null = null;
  const allSendingDays = new Set<number>();

  for (const campaign of activeCampaigns) {
    totalEmailsSent += campaign.emailStats.sent;

    if (campaign.configuration?.sendingDays) {
      campaign.configuration.sendingDays.forEach(d => allSendingDays.add(d));
    }

    const campaignDate = new Date(campaign.createdAt);
    if (!earliestCampaignDate || campaignDate < earliestCampaignDate) {
      earliestCampaignDate = campaignDate;
    }

    const sequenceSteps = campaign.configuration?.sequenceSteps || 3;

    try {
      const leads = await client.getCampaignLeads(campaign.campaignId);

      for (const lead of leads) {
        const leadData = lead.lead || lead;
        const status = leadData.lead_status?.toLowerCase() || '';

        if (status === 'completed' || status === 'blocked' || status === 'stopped') {
          continue;
        }

        const sequencePosition = getLeadSequencePosition(lead);
        totalEmailsRemaining += calculateEmailsRemaining(sequencePosition, sequenceSteps);
      }
    } catch (error) {
      const campaignNotStarted = campaign.leadCounts.notStarted;
      const campaignInProgress = campaign.leadCounts.inprogress;
      totalEmailsRemaining += campaignNotStarted * sequenceSteps;
      totalEmailsRemaining += campaignInProgress * Math.ceil(sequenceSteps / 2);
    }
  }

  const sendingDays = allSendingDays.size > 0 ? Array.from(allSendingDays) : [0, 1, 2, 3, 4, 5, 6];
  const sendingDaysPerWeek = sendingDays.length;

  let avgSendRate = 0;
  if (earliestCampaignDate && totalEmailsSent > 0) {
    const sendingDaysSinceStart = countSendingDays(earliestCampaignDate, today, sendingDays);
    avgSendRate = totalEmailsSent / sendingDaysSinceStart;
  }

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

  const sendingDaysNeeded = Math.ceil(totalEmailsRemaining / avgSendRate);
  const runOutDate = projectRunOutDate(today, sendingDaysNeeded, sendingDays);
  const daysRemaining = Math.ceil((runOutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let trendDirection: TrendDirection = 'insufficient_data';
  let trendPercentChange: number | null = null;

  if (earliestCampaignDate) {
    const daysSinceStart = Math.ceil((today.getTime() - earliestCampaignDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceStart >= 14) {
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

function formatReport(report: ClientCampaignReport, fromDateStr?: string): string {
  const textLines: string[] = [];

  // Summary section
  textLines.push(`=== CLIENT ${report.clientId} CAMPAIGN REPORT ===`);
  if (fromDateStr) {
    textLines.push(`Date Range: From ${fromDateStr} onwards`);
  }
  textLines.push(`\n📊 OVERALL CAMPAIGN STATISTICS (All Leads):`);
  textLines.push(
    `  Total Campaigns: ${report.totalCampaigns} (${report.activeCampaigns} active, ${report.pausedCampaigns} paused)`
  );
  textLines.push(`  Total Leads: ${report.summary.totalLeads.toLocaleString()}`);

  // Status Breakdown
  if (report.summary.totalLeads > 0) {
    textLines.push(
      `    - Not Started: ${report.summary.notStarted.toLocaleString()} (${(
        (report.summary.notStarted / report.summary.totalLeads) *
        100
      ).toFixed(1)}%)`
    );
    textLines.push(
      `    - In Progress: ${report.summary.inprogress.toLocaleString()} (${(
        (report.summary.inprogress / report.summary.totalLeads) *
        100
      ).toFixed(1)}%)`
    );
    textLines.push(
      `    - Completed: ${report.summary.completed.toLocaleString()} (${(
        (report.summary.completed / report.summary.totalLeads) *
        100
      ).toFixed(1)}%)`
    );
    textLines.push(
      `    - Blocked: ${report.summary.blocked.toLocaleString()} (${(
        (report.summary.blocked / report.summary.totalLeads) *
        100
      ).toFixed(1)}%)`
    );
    textLines.push(
      `    - Stopped: ${report.summary.stopped.toLocaleString()} (${(
        (report.summary.stopped / report.summary.totalLeads) *
        100
      ).toFixed(1)}%)`
    );
  }

  // Active Leads Section
  textLines.push(`\n🔄 ACTIVE LEADS (Excluding Completed):`);
  textLines.push(
    `  Total Active: ${report.activeLeadsSummary.totalActive.toLocaleString()}`
  );
  if (report.activeLeadsSummary.totalActive > 0) {
    textLines.push(
      `    - Not Started: ${report.activeLeadsSummary.notStarted.toLocaleString()} (${(
        (report.activeLeadsSummary.notStarted /
          report.activeLeadsSummary.totalActive) *
        100
      ).toFixed(1)}%)`
    );
    textLines.push(
      `    - In Progress: ${report.activeLeadsSummary.inprogress.toLocaleString()} (${(
        (report.activeLeadsSummary.inprogress /
          report.activeLeadsSummary.totalActive) *
        100
      ).toFixed(1)}%)`
    );
    textLines.push(
      `    - Blocked: ${report.activeLeadsSummary.blocked.toLocaleString()} (${(
        (report.activeLeadsSummary.blocked /
          report.activeLeadsSummary.totalActive) *
        100
      ).toFixed(1)}%)`
    );
    textLines.push(
      `    - Stopped: ${report.activeLeadsSummary.stopped.toLocaleString()} (${(
        (report.activeLeadsSummary.stopped /
          report.activeLeadsSummary.totalActive) *
        100
      ).toFixed(1)}%)`
    );
  }

  // Active Campaigns List
  const activeCampaignsList = report.campaigns.filter(
    (c) => c.campaignStatus === "ACTIVE"
  );
  if (activeCampaignsList.length > 0) {
    textLines.push(`\nActive Campaigns: ${activeCampaignsList.length} campaigns`);
    activeCampaignsList.forEach((campaign, index) => {
      textLines.push(
        `${index + 1}. ${campaign.campaignName} (ID: ${campaign.campaignId}) - ${campaign.leadCounts.total.toLocaleString()} leads`
      );
    });
  }

  // Paused Campaigns Section
  if (report.pausedCampaignDetails.length > 0) {
    textLines.push(
      `\nPaused Campaigns: ${report.pausedCampaignDetails.length} campaigns`
    );
    report.pausedCampaignDetails.forEach((pausedCampaign, index) => {
      textLines.push(
        `${index + 1}. ${pausedCampaign.campaignName} (ID: ${pausedCampaign.campaignId}) - ${pausedCampaign.totalLeads.toLocaleString()} leads`
      );
    });
  }

  // Email Statistics (Overall)
  const totalSent = report.campaigns.reduce(
    (sum, c) => sum + c.emailStats.sent,
    0
  );
  const totalOpened = report.campaigns.reduce(
    (sum, c) => sum + c.emailStats.opened,
    0
  );
  const totalClicked = report.campaigns.reduce(
    (sum, c) => sum + c.emailStats.clicked,
    0
  );
  const totalReplied = report.campaigns.reduce(
    (sum, c) => sum + c.emailStats.replied,
    0
  );
  const totalBounced = report.campaigns.reduce(
    (sum, c) => sum + c.emailStats.bounced,
    0
  );

  textLines.push(`\n📧 EMAIL STATISTICS (Overall):`);
  textLines.push(`  Sent: ${totalSent.toLocaleString()}`);
  if (totalSent > 0) {
    textLines.push(
      `  Opened: ${totalOpened.toLocaleString()} (${((totalOpened / totalSent) * 100).toFixed(1)}%)`
    );
    textLines.push(
      `  Clicked: ${totalClicked.toLocaleString()} (${((totalClicked / totalSent) * 100).toFixed(1)}%)`
    );
    textLines.push(
      `  Replied: ${totalReplied.toLocaleString()} (${((totalReplied / totalSent) * 100).toFixed(1)}%)`
    );
    textLines.push(
      `  Bounced: ${totalBounced.toLocaleString()} (${((totalBounced / totalSent) * 100).toFixed(1)}%)`
    );
  }

  // Per-campaign details
  textLines.push(`\n=== PER-CAMPAIGN DETAILS ===`);
  textLines.push(`\nACTIVE CAMPAIGNS:`);
  const activeCampaigns = report.campaigns.filter(
    (c) => c.campaignStatus === "ACTIVE"
  );

  for (const campaign of activeCampaigns) {
    textLines.push(`\n  ${campaign.campaignName}`);
    textLines.push(
      `    Status: ${campaign.campaignStatus} | Created: ${new Date(campaign.createdAt).toLocaleDateString()}`
    );
    textLines.push(
      `    Leads: Not Started=${campaign.leadCounts.notStarted.toLocaleString()}, In Progress=${campaign.leadCounts.inprogress.toLocaleString()}, Completed=${campaign.leadCounts.completed.toLocaleString()}, Blocked=${campaign.leadCounts.blocked.toLocaleString()}, Stopped=${campaign.leadCounts.stopped.toLocaleString()}`
    );
    textLines.push(`    Total: ${campaign.leadCounts.total.toLocaleString()}`);
    textLines.push(
      `    Email Stats: Sent=${campaign.emailStats.sent.toLocaleString()}, Opened=${campaign.emailStats.opened.toLocaleString()}, Clicked=${campaign.emailStats.clicked.toLocaleString()}, Replied=${campaign.emailStats.replied.toLocaleString()}, Bounced=${campaign.emailStats.bounced.toLocaleString()}`
    );

    if (campaign.configuration) {
      textLines.push(
        `    Config: Max/Day=${campaign.configuration.maxLeadsPerDay}, Sending Days=${campaign.configuration.sendingDays.join(",")}, Hours=${campaign.configuration.scheduleHours}, Sequences=${campaign.configuration.sequenceSteps}`
      );
    }
  }

  if (report.meta.notes && report.meta.notes.length > 0) {
    textLines.push(`\nNotes: ${report.meta.notes.join(", ")}`);
  }

  return textLines.join("\n");
}

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

function showUsage() {
  console.log(`
Smartlead Campaign Report Generator

Usage:
  npm run report -- --clientId=<CLIENT_ID> [options]

Options:
  --clientId=<ID>        (Required) Smartlead client ID
  --from=<ISO_DATE>      (Optional) Filter campaigns from this date onwards
                         Example: --from="2025-12-17T00:00:00Z"
  --format=<text|json>   (Optional) Output format (default: text)

Examples:
  # Basic report for client 128520
  npm run report -- --clientId=128520

  # With date filter
  npm run report -- --clientId=128520 --from="2025-12-17"

  # JSON output
  npm run report -- --clientId=128520 --format=json > report.json

  # Direct execution
  node --loader ts-node/esm scripts/generate-report.ts --clientId=128520
  `);
}

async function main() {
  const args = parseArgs();

  if (!args.clientId) {
    console.error("Error: --clientId is required\n");
    showUsage();
    process.exit(1);
  }

  try {
    const config = getConfig();
    const client = new SmartleadClient(config);

    const report = await client.getCampaignReport(args.clientId, args.fromDate);

    if (args.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const fromDateStr = args.fromDate
        ? args.fromDate.toISOString()
        : undefined;
      const formatted = formatReport(report, fromDateStr);
      console.log(formatted);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Failed to generate report: ${err.message}`);
  process.exitCode = 1;
});
