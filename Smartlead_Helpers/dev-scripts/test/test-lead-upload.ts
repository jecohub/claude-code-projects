import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { parseCSV } from "./src/csvProcessor.js";
import { mapCSVRowsToLeads } from "./src/utils/fieldMapper.js";
import { loadClientMapping } from "./src/utils/mappingStorage.js";

async function testLeadUpload() {
  console.log("=== Testing Lead Upload ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  // Use one of the campaigns we just created
  const testCampaignId = 2818383;

  // Load the CSV and mappings
  const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";
  const clientId = "77930";

  console.log("Loading CSV...");
  const csvRows = await parseCSV(csvFilePath);
  console.log(`  Loaded ${csvRows.length} rows`);

  console.log("\nLoading field mappings...");
  const mappings = await loadClientMapping(clientId);

  if (!mappings) {
    console.error("❌ No mappings found for client 77930");
    return;
  }
  console.log(`  Loaded ${mappings.length} field mappings`);

  // Take just the first 5 rows for testing
  const testRows = csvRows.slice(0, 5);
  console.log(`\nConverting ${testRows.length} test rows to leads...`);
  const leads = mapCSVRowsToLeads(testRows, mappings);
  console.log(`  Converted to ${leads.length} lead objects`);

  if (leads.length > 0) {
    console.log("\nFirst lead example:");
    console.log(JSON.stringify(leads[0], null, 2));
  }

  // Try to upload
  console.log(`\nUploading ${leads.length} leads to campaign ${testCampaignId}...`);

  try {
    const result = await client.addLeadsToCampaign(
      testCampaignId,
      leads,
      {
        ignoreGlobalBlockList: false,
        ignoreUnsubscribeList: false,
        ignoreDuplicateLeadsInOtherCampaign: false,
      }
    );

    console.log("\n✅ Upload successful!");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("\n❌ Upload failed:");
    if (error instanceof Error) {
      console.error("  Error name:", error.name);
      console.error("  Error message:", error.message);
      console.error("  Error stack:", error.stack);
    } else {
      console.error("  Error:", error);
    }
  }
}

testLeadUpload().catch(console.error);
