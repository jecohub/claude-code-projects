import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

const campaignId = 2818135;

async function checkCampaign() {
  const config = getConfig();
  const client = new SmartleadClient(config);
  
  console.log("Fetching campaign details...\n");
  const details = await client.getCampaignDetails(campaignId);
  
  console.log("Track Settings:", JSON.stringify(details.track_settings, null, 2));
  console.log("\nScheduler:", JSON.stringify(details.scheduler_cron_value, null, 2));
  console.log("\nMin time between emails:", details.min_time_btwn_emails);
  console.log("Max leads per day:", details.max_leads_per_day);
  
  console.log("\n\nFetching sequences...\n");
  const sequences = await client.getCampaignSequences(campaignId);
  console.log("Sequences count:", sequences.length);
  console.log("Sequences:", JSON.stringify(sequences, null, 2));
}

checkCampaign().catch(console.error);
