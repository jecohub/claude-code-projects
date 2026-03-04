import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getConfig } from "../core/config.js";
import { SmartleadClient } from "../core/smartleadClient.js";
import { BulkUploadService } from "../features/bulk-upload/bulkUploadService.js";
import { parseCSV } from "../features/bulk-upload/csvProcessor.js";
import { generateMappingPreview } from "../features/bulk-upload/utils/fieldMapper.js";
import {
  saveClientMapping,
  loadClientMapping,
  hasClientMapping,
  findUnmappedColumns,
  FieldMapping,
} from "../features/bulk-upload/utils/mappingStorage.js";
import { MailboxSwapService } from "../features/mailbox-swap/index.js";

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

const bulkUploadSchema = z.object({
  csvFilePath: z
    .string()
    .describe("Absolute path to CSV file containing leads")
    .min(1, "csvFilePath is required"),
  sourceCampaignId: z
    .number()
    .describe("Campaign ID to duplicate for each split")
    .int()
    .positive(),
  clientId: z
    .string()
    .optional()
    .describe("Optional Smartlead client ID to assign to campaigns"),
  ignoreGlobalBlockList: z
    .boolean()
    .optional()
    .describe("Whether to ignore global block list when uploading leads (default: false)"),
  isNewCampaign: z
    .boolean()
    .optional()
    .describe("Set to true for first-time upload to preview and save field mappings. Set to false to use saved mappings (default: false)"),
});
type BulkUploadInput = z.infer<typeof bulkUploadSchema>;

const previewMappingSchema = z.object({
  csvFilePath: z
    .string()
    .describe("Absolute path to CSV file to analyze")
    .min(1, "csvFilePath is required"),
  clientId: z
    .string()
    .optional()
    .describe("Optional client ID to check for existing mappings"),
});
type PreviewMappingInput = z.infer<typeof previewMappingSchema>;

const saveMappingSchema = z.object({
  clientId: z
    .string()
    .describe("Smartlead client ID to save mappings for")
    .min(1, "clientId is required"),
  mappings: z
    .array(
      z.object({
        csvColumn: z.string().describe("Primary CSV column name"),
        aliases: z
          .array(z.string())
          .optional()
          .describe("Alternative CSV column names that also map to this field"),
        smartleadField: z
          .enum([
            "email",
            "first_name",
            "last_name",
            "company_name",
            "phone_number",
            "website",
            "location",
            "linkedin_profile",
            "company_url",
            "custom",
          ])
          .describe("Smartlead field type"),
        customFieldName: z
          .string()
          .optional()
          .describe("Custom field name (only used when smartleadField is 'custom')"),
      })
    )
    .describe("Array of field mappings"),
});
type SaveMappingInput = z.infer<typeof saveMappingSchema>;

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
    .min(1, "fromDate is required")
    .regex(/^\d{4}-\d{2}-\d{2}/, "fromDate must be an ISO date string (e.g. '2025-12-01')")
    .describe("ISO date string — only affect campaigns created on or after this date (e.g. '2025-12-01')"),
  toDate: z
    .string()
    .min(1, "toDate is required")
    .regex(/^\d{4}-\d{2}-\d{2}/, "toDate must be an ISO date string (e.g. '2026-01-15')")
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
}).refine(
  (data) => data.minReputation <= data.maxReputation,
  {
    message: "minReputation must be less than or equal to maxReputation",
    path: ["minReputation"],
  }
);
type MailboxSwapInput = z.infer<typeof mailboxSwapSchema>;

async function main() {
  const config = getConfig();
  const client = new SmartleadClient(config);
  const bulkUploadService = new BulkUploadService(client);
  const mailboxSwapService = new MailboxSwapService(client);

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

      // Active Campaigns List
      const activeCampaignsList = report.campaigns.filter(c => c.campaignStatus === "ACTIVE");
      if (activeCampaignsList.length > 0) {
        textLines.push(`\nActive Campaigns: ${activeCampaignsList.length} campaigns`);
        activeCampaignsList.forEach((campaign, index) => {
          textLines.push(`${index + 1}. ${campaign.campaignName} (ID: ${campaign.campaignId}) - ${campaign.leadCounts.total.toLocaleString()} leads`);
        });
      }

      // Paused Campaigns Section
      if (report.pausedCampaignDetails.length > 0) {
        textLines.push(`\nPaused Campaigns: ${report.pausedCampaignDetails.length} campaigns`);
        report.pausedCampaignDetails.forEach((pausedCampaign, index) => {
          textLines.push(`${index + 1}. ${pausedCampaign.campaignName} (ID: ${pausedCampaign.campaignId}) - ${pausedCampaign.totalLeads.toLocaleString()} leads`);
        });
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

  server.registerTool(
    "bulkUploadLeads",
    {
      title: "Bulk upload leads with campaign duplication",
      description:
        "Split a large CSV file by ESP and email validity, duplicate campaigns for each split, and upload leads automatically. " +
        "CSV must contain 'Email Host' column (for Outlook detection) and 'Final Provider' or 'Provider' column (for validity: Bounceban=Catch-all, Million Verifier=Valid). " +
        "Splits each group by max 2000 rows and creates separate campaigns.",
      inputSchema: bulkUploadSchema,
    },
    async (args: BulkUploadInput, _extra: unknown) => {
      const result = await bulkUploadService.execute({
        csvFilePath: args.csvFilePath,
        sourceCampaignId: args.sourceCampaignId,
        clientId: args.clientId,
        ignoreGlobalBlockList: args.ignoreGlobalBlockList,
        isNewCampaign: args.isNewCampaign,
      });

      const textLines: string[] = [];
      textLines.push(`=== BULK UPLOAD RESULT ===`);
      textLines.push(`Status: ${result.success ? "SUCCESS" : "FAILED"}`);
      textLines.push(`\n📊 SUMMARY:`);
      textLines.push(`  Total Splits: ${result.totalSplits}`);
      textLines.push(`  Campaigns Created: ${result.summary.campaignsCreated}`);
      textLines.push(`  Leads Processed: ${result.summary.totalLeadsProcessed.toLocaleString()}`);
      textLines.push(`  Leads Uploaded: ${result.summary.totalLeadsUploaded.toLocaleString()}`);
      textLines.push(`  Leads Failed: ${result.summary.totalLeadsFailed.toLocaleString()}`);

      if (result.campaignResults.length > 0) {
        // Section 1: Campaign names with lead counts
        textLines.push(`\n📋 CAMPAIGNS:`);
        for (const campaign of result.campaignResults) {
          textLines.push(`${campaign.campaignName} - ${campaign.uploadedLeads.toLocaleString()} leads`);
        }

        // Section 2: URLs only (easy to copy)
        textLines.push(`\n🔗 CAMPAIGN URLS:`);
        for (const campaign of result.campaignResults) {
          textLines.push(`https://app.smartlead.ai/app/email-campaign/${campaign.campaignId}/analytics`);
        }

        // Section 3: Detailed info (optional reference)
        textLines.push(`\n📊 DETAILS:`);
        for (const campaign of result.campaignResults) {
          const status = campaign.uploadedLeads > 0 ? "✓" : "✗";
          textLines.push(`  ${status} ${campaign.campaignName} | ${campaign.groupType} | Split ${campaign.splitNumber}`);

          if (campaign.errors.length > 0) {
            textLines.push(`     Errors: ${campaign.errors.join(", ")}`);
          }
        }
      }

      if (result.errors.length > 0) {
        textLines.push(`\n⚠️  ERRORS:`);
        result.errors.forEach((error) => {
          textLines.push(`  - ${error}`);
        });
      }

      const text = textLines.join("\n");

      return {
        structuredContent: {
          ...result,
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
    "previewCSVMapping",
    {
      title: "Preview CSV field mappings",
      description:
        "Analyze a CSV file and show auto-detected field mappings with sample data. " +
        "Use this before bulkUploadLeads with isNewCampaign=true to review mappings. " +
        "Can also check if a client already has saved mappings.",
      inputSchema: previewMappingSchema,
    },
    async (args: PreviewMappingInput, _extra: unknown) => {
      const rows = await parseCSV(args.csvFilePath);
      const preview = generateMappingPreview(rows);

      const textLines: string[] = [];
      textLines.push(`=== CSV FIELD MAPPING PREVIEW ===`);
      textLines.push(`File: ${args.csvFilePath}`);
      textLines.push(`Total Rows: ${rows.length.toLocaleString()}`);

      // Check if client has saved mappings
      if (args.clientId) {
        const hasSaved = await hasClientMapping(args.clientId);
        textLines.push(`\nClient ID: ${args.clientId}`);
        textLines.push(`Saved Mappings: ${hasSaved ? "YES (will be used if isNewCampaign=false)" : "NO (need to save after reviewing)"}`);
      }

      textLines.push(`\n📋 DETECTED FIELD MAPPINGS:`);

      for (const field of preview) {
        const fieldType =
          field.detectedField === "custom"
            ? `custom (${field.csvColumn})`
            : field.detectedField;

        textLines.push(`\n  ${field.csvColumn} → ${fieldType}`);
        if (field.sampleValues.length > 0) {
          textLines.push(`    Samples: ${field.sampleValues.join(", ")}`);
        }
      }

      textLines.push(`\n💡 NEXT STEPS:`);
      if (args.clientId) {
        textLines.push(
          `  1. Review the mappings above`
        );
        textLines.push(
          `  2. If corrections needed, call saveFieldMapping with corrected mappings`
        );
        textLines.push(
          `  3. Call bulkUploadLeads with isNewCampaign=true (first time) or isNewCampaign=false (use saved)`
        );
      } else {
        textLines.push(
          `  1. Provide a clientId parameter to save these mappings`
        );
        textLines.push(
          `  2. Call saveFieldMapping to store the confirmed mappings`
        );
      }

      const text = textLines.join("\n");

      return {
        structuredContent: {
          csvFilePath: args.csvFilePath,
          totalRows: rows.length,
          clientId: args.clientId,
          hasSavedMappings: args.clientId ? await hasClientMapping(args.clientId) : false,
          fieldMappings: preview,
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
    "saveFieldMapping",
    {
      title: "Save field mappings for a client",
      description:
        "Save confirmed field mappings for a Smartlead client. " +
        "These mappings will be automatically used for future uploads with isNewCampaign=false. " +
        "Call previewCSVMapping first to see auto-detected mappings, then save with any corrections.",
      inputSchema: saveMappingSchema,
    },
    async (args: SaveMappingInput, _extra: unknown) => {
      const mappings: FieldMapping[] = args.mappings.map((m) => ({
        csvColumn: m.csvColumn,
        aliases: m.aliases,
        smartleadField: m.smartleadField as any,
        customFieldName: m.customFieldName,
      }));

      await saveClientMapping(args.clientId, mappings);

      const textLines: string[] = [];
      textLines.push(`=== FIELD MAPPINGS SAVED ===`);
      textLines.push(`Client ID: ${args.clientId}`);
      textLines.push(`Mappings Saved: ${mappings.length}`);
      textLines.push(`\n📋 SAVED MAPPINGS:`);

      for (const mapping of mappings) {
        const fieldType =
          mapping.smartleadField === "custom"
            ? `custom (${mapping.customFieldName || mapping.csvColumn})`
            : mapping.smartleadField;

        const aliasInfo = mapping.aliases?.length ? ` (aliases: ${mapping.aliases.join(", ")})` : "";
        textLines.push(`  ${mapping.csvColumn}${aliasInfo} → ${fieldType}`);
      }

      textLines.push(`\n✓ Mappings saved successfully!`);
      textLines.push(`  Future uploads for Client ${args.clientId} with isNewCampaign=false will use these mappings.`);

      const text = textLines.join("\n");

      return {
        structuredContent: {
          clientId: args.clientId,
          mappingsSaved: mappings.length,
          success: true,
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
      let report;
      try {
        report = await mailboxSwapService.execute({
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          structuredContent: { error: message } as Record<string, unknown>,
          content: [{ type: "text", text: `MAILBOX SWAP ERROR: ${message}` }],
        };
      }

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[smartlead-mcp] failed to start: ${err.message}`);
  process.exitCode = 1;
});

