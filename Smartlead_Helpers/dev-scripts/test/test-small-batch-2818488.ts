import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { parseCSV } from "./src/csvProcessor.js";
import { mapCSVRowsToLeads } from "./src/utils/fieldMapper.js";
import { loadClientMapping } from "./src/utils/mappingStorage.js";

async function testSmallBatch() {
  console.log("=== Testing Small Batch Upload to Campaign 2818488 ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  const campaignId = 2818488;
  const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";
  const clientId = "77930";

  console.log("Loading CSV and mappings...");
  const csvRows = await parseCSV(csvFilePath);
  const mappings = await loadClientMapping(clientId);

  if (!mappings) {
    console.error("❌ No mappings found");
    return;
  }

  // Take just 10 leads from the second split
  const testRows = csvRows.slice(2000, 2010);
  console.log(`  Test batch: ${testRows.length} rows`);

  const leads = mapCSVRowsToLeads(testRows, mappings);
  console.log(`  Converted to ${leads.length} leads\n`);

  console.log(`Uploading ${leads.length} leads to campaign ${campaignId}...`);

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

    console.log("\n✅ Upload successful!");
    console.log(`⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log(`📊 Result:`, result);
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`\n❌ Upload failed after ${duration.toFixed(2)}s:`);
    if (error instanceof Error) {
      console.error(`  Name: ${error.name}`);
      console.error(`  Message: ${error.message}`);
      console.error(`  Stack:`, error.stack?.split('\n').slice(0, 5).join('\n'));
    } else {
      console.error(error);
    }
  }
}

testSmallBatch().catch(console.error);
