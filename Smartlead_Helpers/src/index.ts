import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig } from "./config.js";
import { SmartleadClient } from "./smartleadClient.js";

const clientStatusSchema = z.object({
  clientId: z
    .string()
    .describe("Smartlead client ID.")
    .min(1, "clientId is required"),
});
type ClientStatusInput = z.infer<typeof clientStatusSchema>;

const campaignReportSchema = z.object({
  clientId: z
    .string()
    .describe("Smartlead client ID.")
    .min(1, "clientId is required"),
  fromDate: z
    .string()
    .optional()
    .describe("Optional ISO date string to filter campaigns from (e.g., '2025-12-17T00:00:00Z')"),
});
type CampaignReportInput = z.infer<typeof campaignReportSchema>;

async function main() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const server = new McpServer({
    name: "smartlead-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "getClientStatus",
    {
      title: "Smartlead client status",
      description: "Summarize lead and campaign counts for a Smartlead client ID.",
      inputSchema: clientStatusSchema,
    },
    async (args: ClientStatusInput, _extra: unknown) => {
      const summary = await client.getClientStatus(args.clientId);
      const textLines = [];
      if (summary.totals.leads !== undefined) {
        textLines.push(`leads: ${summary.totals.leads}`);
      }
      if (summary.totals.uncontactedLeads !== undefined) {
        textLines.push(`uncontacted: ${summary.totals.uncontactedLeads}`);
      }
      if (summary.totals.pausedCampaigns !== undefined) {
        textLines.push(`paused campaigns: ${summary.totals.pausedCampaigns}`);
      }
      const text = textLines.length
        ? `Client ${summary.clientId} — ${textLines.join(", ")}`
        : `Client ${summary.clientId} status collected`;

      return {
        structuredContent: {
          ...summary,
        } as Record<string, unknown>,
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    },
  );

  server.registerTool(
    "getLeadStatusBreakdown",
    {
      title: "Smartlead lead status breakdown",
      description: "Get a breakdown of lead counts grouped by status for a Smartlead client ID.",
      inputSchema: clientStatusSchema,
    },
    async (args: ClientStatusInput, _extra: unknown) => {
      const breakdown = await client.getLeadStatusBreakdown(args.clientId);
      const textLines = [`Total leads: ${breakdown.totalLeads}`];

      const statusEntries = Object.entries(breakdown.statusBreakdown).sort(
        ([, a], [, b]) => b - a
      );

      if (statusEntries.length > 0) {
        textLines.push("Status breakdown:");
        for (const [status, count] of statusEntries) {
          textLines.push(`  ${status}: ${count}`);
        }
      }

      if (breakdown.meta.notes && breakdown.meta.notes.length > 0) {
        textLines.push(`Notes: ${breakdown.meta.notes.join(", ")}`);
      }

      const text = textLines.join("\n");

      return {
        structuredContent: {
          ...breakdown,
        } as Record<string, unknown>,
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    },
  );

  server.registerTool(
    "getCampaignReport",
    {
      title: "Detailed campaign report",
      description: "Get per-campaign analytics including lead status breakdown and email statistics for a Smartlead client ID. Optionally filter campaigns by creation date.",
      inputSchema: campaignReportSchema,
    },
    async (args: CampaignReportInput, _extra: unknown) => {
      const fromDate = args.fromDate ? new Date(args.fromDate) : undefined;
      const report = await client.getCampaignReport(args.clientId, fromDate);
      const textLines = [];

      // Summary section
      textLines.push(`=== CLIENT ${report.clientId} CAMPAIGN REPORT ===`);
      if (args.fromDate) {
        textLines.push(`Date Range: From ${args.fromDate} onwards`);
      }
      textLines.push(`\n📊 OVERALL CAMPAIGN STATISTICS (All Leads):`);
      textLines.push(`  Total Campaigns: ${report.totalCampaigns} (${report.activeCampaigns} active, ${report.pausedCampaigns} paused)`);
      textLines.push(`  Total Leads: ${report.summary.totalLeads.toLocaleString()}`);

      // Status Breakdown
      if (report.summary.totalLeads > 0) {
        textLines.push(`    - Not Started: ${report.summary.notStarted.toLocaleString()} (${((report.summary.notStarted / report.summary.totalLeads) * 100).toFixed(1)}%)`);
        textLines.push(`    - In Progress: ${report.summary.inprogress.toLocaleString()} (${((report.summary.inprogress / report.summary.totalLeads) * 100).toFixed(1)}%)`);
        textLines.push(`    - Completed: ${report.summary.completed.toLocaleString()} (${((report.summary.completed / report.summary.totalLeads) * 100).toFixed(1)}%)`);
        textLines.push(`    - Blocked: ${report.summary.blocked.toLocaleString()} (${((report.summary.blocked / report.summary.totalLeads) * 100).toFixed(1)}%)`);
        textLines.push(`    - Stopped: ${report.summary.stopped.toLocaleString()} (${((report.summary.stopped / report.summary.totalLeads) * 100).toFixed(1)}%)`);
      }

      // Active Leads Section
      textLines.push(`\n🔄 ACTIVE LEADS (Excluding Completed):`);
      textLines.push(`  Total Active: ${report.activeLeadsSummary.totalActive.toLocaleString()}`);
      if (report.activeLeadsSummary.totalActive > 0) {
        textLines.push(`    - Not Started: ${report.activeLeadsSummary.notStarted.toLocaleString()} (${((report.activeLeadsSummary.notStarted / report.activeLeadsSummary.totalActive) * 100).toFixed(1)}%)`);
        textLines.push(`    - In Progress: ${report.activeLeadsSummary.inprogress.toLocaleString()} (${((report.activeLeadsSummary.inprogress / report.activeLeadsSummary.totalActive) * 100).toFixed(1)}%)`);
        textLines.push(`    - Blocked: ${report.activeLeadsSummary.blocked.toLocaleString()} (${((report.activeLeadsSummary.blocked / report.activeLeadsSummary.totalActive) * 100).toFixed(1)}%)`);
        textLines.push(`    - Stopped: ${report.activeLeadsSummary.stopped.toLocaleString()} (${((report.activeLeadsSummary.stopped / report.activeLeadsSummary.totalActive) * 100).toFixed(1)}%)`);
      }

      // Active Campaigns Summary
      const activeCampaignsList = report.campaigns.filter(c => c.campaignStatus === "ACTIVE");
      if (activeCampaignsList.length > 0) {
        textLines.push(`\n✅ ACTIVE CAMPAIGNS (${activeCampaignsList.length}):`);
        for (const campaign of activeCampaignsList) {
          textLines.push(`  ${campaign.campaignName}`);
          textLines.push(`    Campaign ID: ${campaign.campaignId}`);
          textLines.push(`    Total Leads: ${campaign.leadCounts.total.toLocaleString()}`);
          textLines.push(``);
        }
      }

      // Paused Campaigns Section
      if (report.pausedCampaignDetails.length > 0) {
        textLines.push(`\n⏸️  PAUSED CAMPAIGNS (${report.pausedCampaignDetails.length}):`);
        textLines.push(`  Note: The Smartlead API does not provide pause reasons. Common reasons include:`);
        textLines.push(`    - Daily sending limit reached`);
        textLines.push(`    - Email quota/credits exhausted`);
        textLines.push(`    - Mailbox connectivity issues`);
        textLines.push(`    - Lead exhaustion (all leads completed)`);
        textLines.push(`    - Manually paused by user`);
        textLines.push(``);
        for (const pausedCampaign of report.pausedCampaignDetails) {
          textLines.push(`  ${pausedCampaign.campaignName}`);
          textLines.push(`    Campaign ID: ${pausedCampaign.campaignId}`);
          textLines.push(`    Total Leads: ${pausedCampaign.totalLeads.toLocaleString()}`);
          textLines.push(``);
        }
      }

      // Email Statistics (Overall)
      const totalSent = report.campaigns.reduce((sum, c) => sum + c.emailStats.sent, 0);
      const totalOpened = report.campaigns.reduce((sum, c) => sum + c.emailStats.opened, 0);
      const totalClicked = report.campaigns.reduce((sum, c) => sum + c.emailStats.clicked, 0);
      const totalReplied = report.campaigns.reduce((sum, c) => sum + c.emailStats.replied, 0);
      const totalBounced = report.campaigns.reduce((sum, c) => sum + c.emailStats.bounced, 0);

      textLines.push(`\n📧 EMAIL STATISTICS (Overall):`);
      textLines.push(`  Sent: ${totalSent.toLocaleString()}`);
      if (totalSent > 0) {
        textLines.push(`  Opened: ${totalOpened.toLocaleString()} (${((totalOpened / totalSent) * 100).toFixed(1)}%)`);
        textLines.push(`  Clicked: ${totalClicked.toLocaleString()} (${((totalClicked / totalSent) * 100).toFixed(1)}%)`);
        textLines.push(`  Replied: ${totalReplied.toLocaleString()} (${((totalReplied / totalSent) * 100).toFixed(1)}%)`);
        textLines.push(`  Bounced: ${totalBounced.toLocaleString()} (${((totalBounced / totalSent) * 100).toFixed(1)}%)`);
      }

      // Per-campaign details
      textLines.push(`\n=== PER-CAMPAIGN DETAILS ===`);
      textLines.push(`\nACTIVE CAMPAIGNS:`);
      const activeCampaigns = report.campaigns.filter(c => c.campaignStatus === "ACTIVE");

      for (const campaign of activeCampaigns) {
        textLines.push(`\n  ${campaign.campaignName}`);
        textLines.push(`    Status: ${campaign.campaignStatus} | Created: ${new Date(campaign.createdAt).toLocaleDateString()}`);
        textLines.push(`    Leads: Not Started=${campaign.leadCounts.notStarted.toLocaleString()}, In Progress=${campaign.leadCounts.inprogress.toLocaleString()}, Completed=${campaign.leadCounts.completed.toLocaleString()}, Blocked=${campaign.leadCounts.blocked.toLocaleString()}, Stopped=${campaign.leadCounts.stopped.toLocaleString()}`);
        textLines.push(`    Total: ${campaign.leadCounts.total.toLocaleString()}`);
        textLines.push(`    Email Stats: Sent=${campaign.emailStats.sent.toLocaleString()}, Opened=${campaign.emailStats.opened.toLocaleString()}, Clicked=${campaign.emailStats.clicked.toLocaleString()}, Replied=${campaign.emailStats.replied.toLocaleString()}, Bounced=${campaign.emailStats.bounced.toLocaleString()}`);

        if (campaign.configuration) {
          textLines.push(`    Config: Max/Day=${campaign.configuration.maxLeadsPerDay}, Sending Days=${campaign.configuration.sendingDays.join(',')}, Hours=${campaign.configuration.scheduleHours}, Sequences=${campaign.configuration.sequenceSteps}`);
        }
      }

      if (report.meta.notes && report.meta.notes.length > 0) {
        textLines.push(`\nNotes: ${report.meta.notes.join(", ")}`);
      }

      const text = textLines.join("\n");

      return {
        structuredContent: {
          ...report,
        } as Record<string, unknown>,
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[smartlead-mcp] failed to start: ${err.message}`);
  process.exitCode = 1;
});

