import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { parseCSV } from "./src/csvProcessor.js";
import { mapCSVRowsToLeads } from "./src/utils/fieldMapper.js";
import { loadClientMapping } from "./src/utils/mappingStorage.js";

const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";
const clientId = "77930";
const testCampaignId = 2816471; // First campaign that was created

async function testUpload() {
  console.log("=== TEST LEAD UPLOAD ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  // Load CSV and mappings
  const rows = await parseCSV(csvFilePath);
  const mappings = await loadClientMapping(clientId);

  // Get just first 5 leads for testing
  const testRows = rows.slice(0, 5);
  const leads = mapCSVRowsToLeads(testRows, mappings);

  console.log(`Testing upload of ${leads.length} leads to campaign ${testCampaignId}...`);
  console.log("\nFirst lead to upload:");
  console.log(JSON.stringify(leads[0], null, 2));

  try {
    const response = await client.addLeadsToCampaign(testCampaignId, leads, {
      ignoreGlobalBlockList: false,
      ignoreUnsubscribeList: false,
      ignoreDuplicateLeadsInOtherCampaign: false,
    });

    console.log("\n✅ Upload successful!");
    console.log("Response:", response);
  } catch (error) {
    console.log("\n❌ Upload failed!");
    console.error("Error:", error);
  }
}

testUpload().catch(console.error);
