import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";
import { BulkUploadService } from "../../src/features/bulk-upload/bulkUploadService.js";
import { parseCSV } from "../../src/features/bulk-upload/csvProcessor.js";
import { loadClientMapping, findUnmappedColumns, FieldMapping } from "../../src/features/bulk-upload/utils/mappingStorage.js";
import { LeadRow } from "../../src/core/types.js";
import * as readline from "readline";

// ============================================
// CONFIGURATION - Update these values
// ============================================
const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Recho/Campaign/2026-03-10/C17 __ Recho - 2026 March 10 - Wellness Fitness, Manufacturing, Consumer Goods, Furniture Home Furnishings - CEO_Marketers_Product - 50-500 - Non Enterprise.csv";
const sourceCampaignId = 3019426;
const clientId = "146909";
// ============================================

interface MappingPreviewData {
  standardFields: { csvColumn: string; smartleadField: string; samples: string[] }[];
  customFields: { csvColumn: string; customFieldName: string; samples: string[] }[];
  unmappedColumns: string[];
  totalLeads: number;
}

function getSampleValues(rows: LeadRow[], column: string, maxSamples = 3): string[] {
  const samples: string[] = [];
  for (let i = 0; i < Math.min(maxSamples, rows.length); i++) {
    const value = rows[i][column];
    if (value !== undefined && value !== null && value !== "") {
      const truncated = String(value).length > 40 ? String(value).substring(0, 37) + "..." : String(value);
      samples.push(truncated);
    }
  }
  return samples;
}

function displaySavedMappings(clientId: string, mappings: FieldMapping[]): void {
  console.log("\n" + "=".repeat(80));
  console.log(`SAVED MAPPINGS FOR CLIENT ${clientId}`);
  console.log("=".repeat(80));

  const standardMappings = mappings.filter(m => m.smartleadField !== "custom");
  const customMappings = mappings.filter(m => m.smartleadField === "custom");

  console.log(`\n📋 STANDARD FIELDS (${standardMappings.length}):`);
  if (standardMappings.length > 0) {
    console.log("  " + "-".repeat(50));
    console.log(`  ${"CSV Column".padEnd(25)} → Smartlead Field`);
    console.log("  " + "-".repeat(50));
    for (const m of standardMappings) {
      console.log(`  ${m.csvColumn.padEnd(25)} → ${m.smartleadField}`);
    }
  } else {
    console.log("  (none)");
  }

  console.log(`\n🏷️  CUSTOM FIELDS (${customMappings.length}):`);
  if (customMappings.length > 0) {
    console.log("  " + "-".repeat(50));
    console.log(`  ${"CSV Column".padEnd(25)} → Custom Field Name`);
    console.log("  " + "-".repeat(50));
    for (const m of customMappings) {
      console.log(`  ${m.csvColumn.padEnd(25)} → ${m.customFieldName || m.csvColumn}`);
    }
  } else {
    console.log("  (none)");
  }

  console.log("\n" + "=".repeat(80));
}

function displayMappingPreview(preview: MappingPreviewData): void {
  console.log("\n" + "=".repeat(80));
  console.log("CSV FIELD MAPPING PREVIEW");
  console.log("=".repeat(80));

  // Standard fields
  console.log(`\n📋 STANDARD SMARTLEAD FIELDS (${preview.standardFields.length}):`);
  if (preview.standardFields.length > 0) {
    console.log("  " + "-".repeat(76));
    console.log(`  ${"CSV Column".padEnd(25)} → ${"Smartlead Field".padEnd(18)} Sample Values`);
    console.log("  " + "-".repeat(76));
    for (const field of preview.standardFields) {
      const samples = field.samples.length > 0 ? `"${field.samples.join('", "')}"` : "(empty)";
      console.log(`  ${field.csvColumn.padEnd(25)} → ${field.smartleadField.padEnd(18)} ${samples}`);
    }
  } else {
    console.log("  (none)");
  }

  // Custom fields
  console.log(`\n🏷️  CUSTOM FIELDS (${preview.customFields.length}):`);
  if (preview.customFields.length > 0) {
    console.log("  " + "-".repeat(76));
    console.log(`  ${"CSV Column".padEnd(25)} → ${"Custom Field Name".padEnd(18)} Sample Values`);
    console.log("  " + "-".repeat(76));
    for (const field of preview.customFields) {
      const samples = field.samples.length > 0 ? `"${field.samples.join('", "')}"` : "(empty)";
      console.log(`  ${field.csvColumn.padEnd(25)} → ${field.customFieldName.padEnd(18)} ${samples}`);
    }
  } else {
    console.log("  (none)");
  }

  // Unmapped columns
  if (preview.unmappedColumns.length > 0) {
    console.log(`\n⚠️  UNMAPPED COLUMNS (${preview.unmappedColumns.length}):`);
    console.log("  " + "-".repeat(76));
    for (const col of preview.unmappedColumns) {
      console.log(`  ❌ ${col}`);
    }
    console.log("\n  These columns will NOT be uploaded. Update mappings if needed.");
  } else {
    console.log(`\n✅ ALL COLUMNS MAPPED`);
  }

  console.log(`\n📊 Total leads in CSV: ${preview.totalLeads.toLocaleString()}`);
  console.log("=".repeat(80) + "\n");
}

async function buildMappingPreview(rows: LeadRow[], mappings: FieldMapping[]): Promise<MappingPreviewData> {
  const csvColumns = Object.keys(rows[0]);
  const unmappedColumns = findUnmappedColumns(csvColumns, mappings);

  const standardFields: MappingPreviewData["standardFields"] = [];
  const customFields: MappingPreviewData["customFields"] = [];

  for (const mapping of mappings) {
    // Only include if column exists in CSV
    if (!csvColumns.includes(mapping.csvColumn)) continue;

    const samples = getSampleValues(rows, mapping.csvColumn);

    if (mapping.smartleadField === "custom") {
      customFields.push({
        csvColumn: mapping.csvColumn,
        customFieldName: mapping.customFieldName || mapping.csvColumn,
        samples,
      });
    } else {
      standardFields.push({
        csvColumn: mapping.csvColumn,
        smartleadField: mapping.smartleadField,
        samples,
      });
    }
  }

  return {
    standardFields,
    customFields,
    unmappedColumns,
    totalLeads: rows.length,
  };
}

async function getUserConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function runBulkUpload() {
  console.log("=== SMARTLEAD BULK UPLOAD ===\n");
  console.log(`CSV File: ${csvFilePath}`);
  console.log(`Source Campaign ID: ${sourceCampaignId}`);
  console.log(`Client ID: ${clientId}`);

  // Step 1: Load mappings and CSV
  console.log("\nLoading mappings and CSV data...");
  const mappings = await loadClientMapping(clientId);
  if (!mappings) {
    console.error(`\n❌ No saved mappings found for client ${clientId}`);
    console.error("Please create mappings first using save-mapping.ts");
    process.exit(1);
  }

  const allRows = await parseCSV(csvFilePath);
  // Find the email column from mappings and filter out rows with blank emails
  const emailMapping = mappings.find(m => m.smartleadField === "email");
  const csvColumns = allRows.length > 0 ? Object.keys(allRows[0]) : [];
  const emailColumn = emailMapping
    ? ([emailMapping.csvColumn, ...(emailMapping.aliases || [])].find(col => csvColumns.includes(col)) ?? emailMapping.csvColumn)
    : "Final Email";
  const rows = allRows.filter(row => {
    const email = row[emailColumn];
    return email !== undefined && email !== null && String(email).trim() !== "";
  });
  console.log(`Filtered ${allRows.length.toLocaleString()} total rows → ${rows.length.toLocaleString()} with valid emails (removed ${(allRows.length - rows.length).toLocaleString()} blank)`);
  if (rows.length === 0) {
    console.error("\n❌ No rows with valid emails found");
    process.exit(1);
  }

  // Step 2: Display saved mappings for this client
  displaySavedMappings(clientId, mappings);

  // Step 3: Build and display CSV preview
  const preview = await buildMappingPreview(rows, mappings);
  displayMappingPreview(preview);

  // Step 4: Check for unmapped columns
  if (preview.unmappedColumns.length > 0) {
    console.log("⚠️  WARNING: Some columns are not mapped and will be skipped.");
    console.log("   If these columns contain important data, update the mappings first.\n");
  }

  // Step 5: Get user confirmation
  const confirmed = await getUserConfirmation("Proceed with upload? (y/n): ");
  if (!confirmed) {
    console.log("\n❌ Upload cancelled by user.");
    process.exit(0);
  }

  // Step 6: Execute upload
  const config = getConfig();
  const client = new SmartleadClient(config);
  const service = new BulkUploadService(client);

  console.log("\nStarting upload process...\n");

  const result = await service.execute({
    csvFilePath,
    sourceCampaignId,
    clientId,
    ignoreGlobalBlockList: false,
    isNewCampaign: false,  // Use saved mappings
  });

  console.log("\n=== BULK UPLOAD RESULT ===");
  console.log(`Status: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}`);
  const hasVerified = result.summary.totalLeadsVerified != null;
  const verifiedDiffers = hasVerified && result.summary.totalLeadsVerified !== result.summary.totalLeadsUploaded;

  console.log(`\n📊 SUMMARY:`);
  console.log(`  Total Splits: ${result.totalSplits}`);
  console.log(`  Campaigns Created: ${result.summary.campaignsCreated}`);
  console.log(`  Leads Processed: ${result.summary.totalLeadsProcessed.toLocaleString()}`);
  if (hasVerified) {
    console.log(`  Leads Uploaded (Verified): ${result.summary.totalLeadsVerified!.toLocaleString()}${verifiedDiffers ? ` (API reported: ${result.summary.totalLeadsUploaded.toLocaleString()})` : ""}`);
  } else {
    console.log(`  Leads Uploaded: ${result.summary.totalLeadsUploaded.toLocaleString()}`);
  }
  console.log(`  Leads Failed: ${result.summary.totalLeadsFailed.toLocaleString()}`);

  if (result.campaignResults.length > 0) {
    console.log(`\n📋 CAMPAIGN DETAILS:`);
    for (const campaign of result.campaignResults) {
      const verified = campaign.verifiedLeadCount;
      const displayCount = verified ?? campaign.uploadedLeads;
      const status = displayCount > 0 ? "✓" : "✗";
      console.log(`\n  ${status} ${campaign.campaignName} (ID: ${campaign.campaignId})`);
      console.log(`     Group: ${campaign.groupType} | Split: ${campaign.splitNumber}`);
      if (verified != null && verified !== campaign.uploadedLeads) {
        console.log(`     Verified Leads: ${verified.toLocaleString()} (API reported: ${campaign.uploadedLeads.toLocaleString()})`);
      } else {
        console.log(`     Uploaded: ${displayCount.toLocaleString()}/${campaign.totalLeads.toLocaleString()} leads`);
      }

      if (campaign.errors.length > 0) {
        console.log(`     Errors: ${campaign.errors.join(", ")}`);
      }
    }
  }

  if (result.errors.length > 0) {
    console.log(`\n⚠️  ERRORS:`);
    result.errors.forEach((error) => {
      console.log(`  - ${error}`);
    });
  }

  // Success summary with verification URLs
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`✅ CAMPAIGNS CREATED WITH AUTOMATED SETTINGS`);
  console.log(`${'='.repeat(80)}`);

  // Section 1: Campaign names with lead counts (prefer verified)
  console.log(`\n📋 CAMPAIGNS:`);
  result.campaignResults.forEach((campaign) => {
    const count = campaign.verifiedLeadCount ?? campaign.uploadedLeads;
    const suffix = campaign.verifiedLeadCount != null ? " (verified)" : "";
    console.log(`${campaign.campaignName} - ${count.toLocaleString()} leads${suffix}`);
  });

  // Section 2: URLs only (easy to copy)
  console.log(`\n🔗 CAMPAIGN URLS:`);
  result.campaignResults.forEach((campaign) => {
    console.log(`https://app.smartlead.ai/app/email-campaign/${campaign.campaignId}/analytics`);
  });

  console.log(`\n✅ All automated settings applied successfully:`);
  console.log(`   • AI Categorization - 10 categories`);
  console.log(`   • Bounce Protection - 4% threshold`);
  console.log(`   • Domain Rate Limiting - Enabled`);
  console.log(`   • Plain Text Mode - Enabled`);
  console.log(`   • OOO Detection - Copied from source`);
  console.log(`   • Sequences & Schedule - Copied from source\n`);
  console.log(`${'='.repeat(80)}\n`);
}

runBulkUpload().catch((error) => {
  console.error("\n❌ Upload failed:");
  console.error(error);
  process.exit(1);
});
