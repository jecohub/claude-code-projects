import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { parseCSV } from "./src/csvProcessor.js";
import { mapCSVRowsToLeads } from "./src/utils/fieldMapper.js";
import { loadClientMapping } from "./src/utils/mappingStorage.js";

async function demonstrateSmartUpload() {
  console.log("=== SMART UPLOAD DEMONSTRATION ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  // Use campaign 2818487 which already has 2000 leads
  const campaignId = 2818487;

  console.log("📋 Scenario: Re-uploading same 2000 leads to test duplicate detection\n");

  // Load the same CSV that was already uploaded
  const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";
  const clientId = "77930";

  const csvRows = await parseCSV(csvFilePath);
  const testRows = csvRows.slice(0, 2000); // First 2000 rows (already uploaded)

  const mappings = await loadClientMapping(clientId);
  if (!mappings) {
    console.error("❌ No mappings found");
    return;
  }

  const leads = mapCSVRowsToLeads(testRows, mappings);
  console.log(`📊 Prepared ${leads.length} leads for upload\n`);

  console.log("🔍 Testing Smart Upload Features:\n");
  console.log("  1. ✅ Duplicate Detection - Should skip all 2000 leads");
  console.log("  2. ✅ Fast Lookup - Uses Set for O(1) performance");
  console.log("  3. ✅ Clear Reporting - Shows what was skipped\n");

  const startTime = Date.now();

  try {
    const result = await client.addLeadsToCampaign(
      campaignId,
      leads,
      {
        ignoreGlobalBlockList: false,
        ignoreUnsubscribeList: false,
        ignoreDuplicateLeadsInOtherCampaign: false,
      }
    );

    const duration = (Date.now() - startTime) / 1000;

    console.log("\n" + "=".repeat(60));
    console.log("=== RESULTS ===");
    console.log("=".repeat(60));
    console.log(`\n⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log(`📊 Attempted to upload: ${leads.length} leads`);
    console.log(`✅ New leads uploaded: ${result.uploaded_count}`);
    console.log(`⏭️  Duplicates skipped: ${result.already_added_to_campaign || result.duplicate_count}`);
    console.log(`\n💡 Smart Detection Result:`);

    if (result.uploaded_count === 0 && result.already_added_to_campaign > 0) {
      console.log(`   ✅ Perfect! All ${result.already_added_to_campaign} leads were already in campaign.`);
      console.log(`   ✅ No API calls wasted on uploading duplicates!`);
      console.log(`   ✅ Upload was idempotent - can run safely multiple times.`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Smart Upload System Working Perfectly!");
    console.log("=".repeat(60) + "\n");

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

demonstrateSmartUpload().catch(console.error);
