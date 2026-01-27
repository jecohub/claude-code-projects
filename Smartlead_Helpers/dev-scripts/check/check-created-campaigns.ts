import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function checkCampaigns() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const campaignIds = [2818383, 2818384];

  for (const id of campaignIds) {
    console.log(`\n=== Campaign ${id} ===`);
    try {
      const sequences = await client.getCampaignSequences(id);
      console.log(`✅ Sequences: ${sequences.length}`);

      const details = await client.getCampaignDetails(id);
      console.log(`✅ Name: ${details.name}`);
      console.log(`✅ Status: Campaign created successfully with sequences`);
    } catch (error) {
      console.error(`❌ Error:`, error);
    }
  }
}

checkCampaigns().catch(console.error);
