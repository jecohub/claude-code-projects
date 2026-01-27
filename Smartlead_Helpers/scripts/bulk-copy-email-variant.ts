import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";

// Configuration defaults
const DEFAULT_SOURCE_CAMPAIGN = 2856396;
const DEFAULT_CLIENT_ID = "127608";
const DEFAULT_FROM_DATE = "2025-12-18T00:00:00Z";
const DEFAULT_NAME_FILTER = "Tech";
const SEQ_NUMBER = 2; // Email 2
const VARIANT_LABEL = "B"; // Variant B

interface CliArgs {
  execute: boolean;
  clientId: string;
  sourceCampaign: number;
  fromDate: Date;
  nameFilter: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  const execute = args.includes("--execute");
  const clientId =
    args.find((a) => a.startsWith("--clientId="))?.split("=")[1] ||
    DEFAULT_CLIENT_ID;
  const sourceCampaignStr =
    args.find((a) => a.startsWith("--sourceCampaign="))?.split("=")[1];
  const sourceCampaign = sourceCampaignStr
    ? parseInt(sourceCampaignStr, 10)
    : DEFAULT_SOURCE_CAMPAIGN;
  const fromDateStr =
    args.find((a) => a.startsWith("--fromDate="))?.split("=")[1] ||
    DEFAULT_FROM_DATE;
  const fromDate = new Date(fromDateStr);
  const nameFilter =
    args.find((a) => a.startsWith("--nameFilter="))?.split("=")[1] ||
    DEFAULT_NAME_FILTER;

  return {
    execute,
    clientId,
    sourceCampaign,
    fromDate,
    nameFilter,
  };
}

interface MatchingCampaign {
  id: number;
  name: string;
  created_at: string;
  status?: string;
}

async function findMatchingCampaigns(
  client: SmartleadClient,
  clientId: string,
  fromDate: Date,
  nameFilter: string,
): Promise<MatchingCampaign[]> {
  console.log("Fetching campaigns...");
  try {
    const campaignsResponse = await client.listCampaigns(clientId, {
      pageSize: 1000,
    });

  const allCampaigns = campaignsResponse.items as any[];

  // Filter by date and name
  const matchingCampaigns = allCampaigns.filter((campaign: any) => {
    const createdAt = new Date(campaign.created_at);
    const matchesDate = createdAt >= fromDate;
    const matchesName = campaign.name
      ?.toLowerCase()
      .includes(nameFilter.toLowerCase());

    return matchesDate && matchesName;
  });

    return matchingCampaigns.map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name || `Campaign ${campaign.id}`,
      created_at: campaign.created_at,
      status: campaign.status,
    }));
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorDetails = error?.cause ? ` (${error.cause})` : '';
    throw new Error(`Failed to fetch campaigns: ${errorMessage}${errorDetails}`);
  }
}

function displayPreview(
  campaigns: MatchingCampaign[],
  clientId: string,
  fromDate: Date,
  nameFilter: string,
): void {
  console.log("\n" + "=".repeat(60));
  console.log("  PREVIEW: Campaigns Matching Criteria");
  console.log("=".repeat(60));
  console.log(`Client ID: ${clientId}`);
  console.log(`Date Filter: From ${fromDate.toISOString().split("T")[0]} onwards`);
  console.log(`Name Filter: Contains "${nameFilter}"`);
  console.log("");

  if (campaigns.length === 0) {
    console.log("No matching campaigns found.");
    return;
  }

  console.log(`Found ${campaigns.length} matching campaign(s):\n`);
  console.log(
    "Campaign ID".padEnd(15) +
      " | " +
      "Campaign Name".padEnd(50) +
      " | " +
      "Created Date".padEnd(12) +
      " | " +
      "Status",
  );
  console.log("-".repeat(15) + "-+-" + "-".repeat(50) + "-+-" + "-".repeat(12) + "-+-" + "-".repeat(10));

  campaigns.forEach((campaign) => {
    const createdDate = new Date(campaign.created_at)
      .toISOString()
      .split("T")[0];
    const status = campaign.status || "N/A";
    console.log(
      String(campaign.id).padEnd(15) +
        " | " +
        (campaign.name.length > 50
          ? campaign.name.substring(0, 47) + "..."
          : campaign.name
        ).padEnd(50) +
        " | " +
        createdDate.padEnd(12) +
        " | " +
        status,
    );
  });

  console.log(`\nTotal: ${campaigns.length} campaign(s) would be updated.`);
  console.log("\nRun with --execute to perform updates.");
}

async function fetchSourceVariant(
  client: SmartleadClient,
  sourceCampaignId: number,
): Promise<any> {
  console.log(`\nFetching source campaign sequences (ID: ${sourceCampaignId})...`);
  const sourceSequences = await client.getCampaignSequences(sourceCampaignId);

  const sourceEmail = sourceSequences.find(
    (seq: any) => seq.seq_number === SEQ_NUMBER,
  );
  if (!sourceEmail) {
    throw new Error(
      `Email ${SEQ_NUMBER} not found in source campaign ${sourceCampaignId}`,
    );
  }

  const variants = sourceEmail.sequence_variants || sourceEmail.seq_variants;
  if (!variants || !Array.isArray(variants)) {
    throw new Error(
      `Email ${SEQ_NUMBER} has no variants in source campaign ${sourceCampaignId}`,
    );
  }

  const variantB = variants.find((v: any) => v.variant_label === VARIANT_LABEL);
  if (!variantB) {
    throw new Error(
      `Variant ${VARIANT_LABEL} not found in Email ${SEQ_NUMBER}`,
    );
  }

  console.log(`✓ Found Variant ${VARIANT_LABEL}:`);
  console.log(`  Subject: ${variantB.subject}`);
  console.log(
    `  Body preview: ${variantB.email_body?.substring(0, 100)}...`,
  );

  return variantB;
}

function sanitizeSequences(
  targetSequences: any[],
  targetEmailIndex: number,
  variantB: any,
): any[] {
  return targetSequences.map((seq: any, index: number) => {
    const sanitized: any = {
      seq_number: seq.seq_number,
      seq_delay_details: {
        delay_in_days:
          seq.seq_delay_details?.delayInDays ||
          seq.seq_delay_details?.delay_in_days ||
          1,
      },
      subject: seq.subject || "",
      email_body: seq.email_body || "",
    };

    // For Email 2, keep Variant A (0%) and add Variant B (100%)
    if (index === targetEmailIndex) {
      const existingVariants = seq.sequence_variants || seq.seq_variants || [];
      const variantA = existingVariants.find(
        (v: any) => v.variant_label === "A",
      );

      sanitized.seq_variants = [
        // Keep Variant A but turn it off (0%)
        {
          subject: variantA?.subject || seq.subject || "",
          email_body: variantA?.email_body || seq.email_body || "",
          variant_label: "A",
          variant_distribution_percentage: 0,
        },
        // Add Variant B with source content, turned on (100%)
        {
          subject: variantB.subject || "",
          email_body: variantB.email_body || "",
          variant_label: "B",
          variant_distribution_percentage: 100,
        },
      ];
    } else {
      // Keep existing variants for other emails
      const variants = seq.sequence_variants || seq.seq_variants;
      if (variants && Array.isArray(variants) && variants.length > 0) {
        sanitized.seq_variants = variants.map((variant: any) => ({
          subject: variant.subject || "",
          email_body: variant.email_body || "",
          variant_label: variant.variant_label,
          ...(variant.optional_email_body_1 != null && {
            optional_email_body_1: variant.optional_email_body_1,
          }),
          ...(variant.variant_distribution_percentage != null && {
            variant_distribution_percentage:
              variant.variant_distribution_percentage,
          }),
        }));
      }
    }

    return sanitized;
  });
}

async function updateCampaign(
  client: SmartleadClient,
  campaignId: number,
  campaignName: string,
  variantB: any,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch target sequences
    const targetSequences = await client.getCampaignSequences(campaignId);

    // Find Email 2
    const targetEmailIndex = targetSequences.findIndex(
      (seq: any) => seq.seq_number === SEQ_NUMBER,
    );
    if (targetEmailIndex === -1) {
      return {
        success: false,
        error: `Email ${SEQ_NUMBER} not found in campaign`,
      };
    }

    // Build sanitized sequences
    const sanitizedSequences = sanitizeSequences(
      targetSequences,
      targetEmailIndex,
      variantB,
    );

    // Save sequences
    await client.saveCampaignSequences(campaignId, sanitizedSequences);

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

async function executeUpdates(
  client: SmartleadClient,
  campaigns: MatchingCampaign[],
  sourceCampaignId: number,
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("  UPDATING CAMPAIGNS");
  console.log("=".repeat(60));
  console.log(`Source Campaign: ${sourceCampaignId} (Email ${SEQ_NUMBER} Variant ${VARIANT_LABEL})`);
  console.log(`Target Campaigns: ${campaigns.length}`);
  console.log("");

  // Fetch source variant once
  const variantB = await fetchSourceVariant(client, sourceCampaignId);

  const results: Array<{
    campaignId: number;
    campaignName: string;
    success: boolean;
    error?: string;
  }> = [];

  // Update each campaign
  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    const progress = `[${i + 1}/${campaigns.length}]`;
    process.stdout.write(
      `${progress} Updating campaign ${campaign.id}: ${campaign.name}... `,
    );

    const result = await updateCampaign(
      client,
      campaign.id,
      campaign.name,
      variantB,
    );

    results.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      success: result.success,
      error: result.error,
    });

    if (result.success) {
      console.log("✓");
    } else {
      console.log(`✗ (${result.error})`);
    }
  }

  // Display summary
  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.log("\nFailed campaigns:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.campaignId}: ${r.campaignName}`);
        console.log(`    Error: ${r.error}`);
      });
  }
}

function showUsage(): void {
  console.log(`
Bulk Copy Email Variant B to Tech Campaigns

Usage:
  npm run bulk-copy-variant [options]

Options:
  --execute              Actually perform updates (default: preview only)
  --clientId=<ID>        Client ID (default: ${DEFAULT_CLIENT_ID})
  --sourceCampaign=<ID>  Source campaign ID (default: ${DEFAULT_SOURCE_CAMPAIGN})
  --fromDate=<ISO_DATE>  Start date filter (default: ${DEFAULT_FROM_DATE})
  --nameFilter=<TEXT>    Name filter text (default: "${DEFAULT_NAME_FILTER}")

Examples:
  # Preview matching campaigns
  npm run bulk-copy-variant

  # Execute updates
  npm run bulk-copy-variant -- --execute

  # Custom filters
  npm run bulk-copy-variant -- --execute --fromDate="2025-12-20" --nameFilter="Tech"
  `);
}

async function main() {
  const args = parseArgs();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showUsage();
    return;
  }

  try {
    const config = getConfig();
    const client = new SmartleadClient(config);

    // Find matching campaigns
    const matchingCampaigns = await findMatchingCampaigns(
      client,
      args.clientId,
      args.fromDate,
      args.nameFilter,
    );

    // Display preview
    displayPreview(
      matchingCampaigns,
      args.clientId,
      args.fromDate,
      args.nameFilter,
    );

    // Execute updates if requested
    if (args.execute) {
      if (matchingCampaigns.length === 0) {
        console.log("\nNo campaigns to update.");
        return;
      }

      console.log("\n" + "=".repeat(60));
      console.log("  WARNING: This will modify campaign sequences!");
      console.log("=".repeat(60));
      console.log(
        `About to update ${matchingCampaigns.length} campaign(s) with Email ${SEQ_NUMBER} Variant ${VARIANT_LABEL}.`,
      );
      console.log("Variant A will be set to 0%, Variant B will be set to 100%.\n");

      await executeUpdates(client, matchingCampaigns, args.sourceCampaign);
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
  console.error(`Failed: ${err.message}`);
  process.exitCode = 1;
});
