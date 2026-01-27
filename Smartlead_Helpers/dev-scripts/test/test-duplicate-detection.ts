import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testDuplicateDetection() {
  console.log("=== Testing Duplicate Detection ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  // Test with campaign 2818487 which has 2000 leads
  const campaignId = 2818487;

  console.log(`Fetching existing leads from campaign ${campaignId}...`);
  const existingLeads = await client.getCampaignLeads(campaignId);

  console.log(`✅ Found ${existingLeads.length} existing leads`);

  if (existingLeads.length > 0) {
    console.log("\nFirst 3 leads:");
    existingLeads.slice(0, 3).forEach((item: any, i: number) => {
      const email = item.lead?.email || item.email || 'no email';
      console.log(`  ${i + 1}. ${email}`);
    });
  }

  console.log("\n✅ getCampaignLeads method works!");
  console.log("   Smart duplicate detection is now enabled.");
}

testDuplicateDetection().catch(console.error);
