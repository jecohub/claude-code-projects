import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { parseCSV } from "./src/csvProcessor.js";
import { mapCSVRowsToLeads } from "./src/utils/fieldMapper.js";
import { loadClientMapping } from "./src/utils/mappingStorage.js";

async function retryUpload() {
  console.log("=== Retrying Upload for Campaign 2818488 ===\n");

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

  // Get the second split (rows 2000-3210)
  const secondSplitRows = csvRows.slice(2000, 3211);
  console.log(`  Second split: ${secondSplitRows.length} rows`);

  const leads = mapCSVRowsToLeads(secondSplitRows, mappings);
  console.log(`  Converted to ${leads.length} leads\n`);

  console.log(`Uploading ${leads.length} leads to campaign ${campaignId}...`);
  console.log(`(Timeout increased to 120s)\n`);

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
    console.log(`📊 Uploaded: ${result.uploaded_count}/${leads.length}`);

    if (result.duplicate_count > 0) {
      console.log(`⚠️  Duplicates: ${result.duplicate_count}`);
    }
    if (result.invalid_email_count > 0) {
      console.log(`⚠️  Invalid emails: ${result.invalid_email_count}`);
    }
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`\n❌ Upload failed after ${duration.toFixed(2)}s:`);
    console.error(error instanceof Error ? error.message : error);
  }
}

retryUpload().catch(console.error);
