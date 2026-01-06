import { getConfig } from "../src/config.js";
import { SmartleadClient } from "../src/smartleadClient.js";
import type { ClientCampaignReport } from "../src/types.js";

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
