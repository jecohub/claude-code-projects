import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { BulkUploadService } from "./src/bulkUploadService.js";
import { parseCSV } from "./src/csvProcessor.js";

async function testFullIntegration() {
  console.log("=== FULL INTEGRATION TEST ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);
  const service = new BulkUploadService(client);

  // Test parameters from user's request
  const sourceCampaignId = 2818135;
  const clientId = "77930";
  const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";

  // Preview the CSV first
  console.log("📊 Analyzing CSV file...\n");
  const csvRows = await parseCSV(csvFilePath);
  console.log(`  Total rows in CSV: ${csvRows.length}`);

  if (csvRows.length > 0) {
    console.log(`  Columns: ${Object.keys(csvRows[0]).join(", ")}`);
  }

  // Get source campaign info
  console.log("\n🔍 Source campaign details...\n");
  const sourceCampaign = await client.getCampaignDetails(sourceCampaignId);
  console.log(`  Campaign: ${sourceCampaign.name}`);
  console.log(`  ID: ${sourceCampaignId}`);

  const sequences = await client.getCampaignSequences(sourceCampaignId);
  console.log(`  Sequences: ${sequences.length}`);

  console.log("\n⚠️  WARNING: This will create new campaigns and upload leads!");
  console.log("   Press Ctrl+C within 5 seconds to cancel...\n");

  // Wait 5 seconds to allow cancellation
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log("🚀 Starting bulk upload process...\n");

  const startTime = Date.now();

  const result = await service.execute({
    csvFilePath,
    sourceCampaignId,
    clientId,
    isNewCampaign: false, // Using existing mappings
    ignoreGlobalBlockList: false,
  });

  const duration = Date.now() - startTime;

  console.log("\n" + "=".repeat(60));
  console.log("=== INTEGRATION TEST RESULTS ===");
  console.log("=".repeat(60) + "\n");

  console.log(`✅ Success: ${result.success}`);
  console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`📊 Total Splits: ${result.totalSplits}\n`);

  console.log("📈 Summary:");
  console.log(`  Leads Processed: ${result.summary.totalLeadsProcessed}`);
  console.log(`  Leads Uploaded: ${result.summary.totalLeadsUploaded}`);
  console.log(`  Leads Failed: ${result.summary.totalLeadsFailed}`);
  console.log(`  Campaigns Created: ${result.summary.campaignsCreated}\n`);

  if (result.campaignResults.length > 0) {
    console.log("📋 Campaign Results:");
    result.campaignResults.forEach((cr, i) => {
      console.log(`\n  ${i + 1}. ${cr.campaignName}`);
      console.log(`     Campaign ID: ${cr.campaignId}`);
      console.log(`     Group: ${cr.groupType}, Split: ${cr.splitNumber}`);
      console.log(`     Uploaded: ${cr.uploadedLeads}/${cr.totalLeads}`);
      if (cr.errors.length > 0) {
        console.log(`     Errors: ${cr.errors.join("; ")}`);
      }
    });
  }

  if (result.errors.length > 0) {
    console.log("\n❌ Errors:");
    result.errors.forEach(err => console.log(`  - ${err}`));
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Integration test completed in ${(duration / 1000).toFixed(2)}s`);
  console.log("=".repeat(60) + "\n");
}

testFullIntegration().catch(console.error);
