import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testLeadStructure() {
  console.log("=== Testing Lead Structure ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  const campaignId = 2818487;

  const existingLeads = await client.getCampaignLeads(campaignId);

  console.log(`Found ${existingLeads.length} leads`);

  if (existingLeads.length > 0) {
    console.log("\nFirst lead structure:");
    console.log(JSON.stringify(existingLeads[0], null, 2));
  }
}

testLeadStructure().catch(console.error);
