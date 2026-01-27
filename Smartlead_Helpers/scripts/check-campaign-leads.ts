import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";

const campaignIds = [2816471, 2816344, 2816485];

async function checkCampaignLeads() {
  console.log("=== CHECKING CAMPAIGN LEADS ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  for (const campaignId of campaignIds) {
    try {
      console.log(`\nCampaign ${campaignId}:`);
      const details = await client.getCampaignDetails(campaignId);

      console.log(`  Name: ${details.name}`);
      console.log(`  Total Leads: ${details.total_leads || 0}`);
      console.log(`  Active Leads: ${details.active_leads || 0}`);
      console.log(`  Paused Leads: ${details.paused_leads || 0}`);
      console.log(`  Completed Leads: ${details.completed_leads || 0}`);
      console.log(`  Status: ${details.status || 'unknown'}`);
    } catch (error) {
      console.log(`  ❌ Error fetching campaign: ${error}`);
    }
  }
}

checkCampaignLeads().catch(console.error);
