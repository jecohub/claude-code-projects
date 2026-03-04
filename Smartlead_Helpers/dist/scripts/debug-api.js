import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";
async function test() {
    const config = getConfig();
    const client = new SmartleadClient(config);
    const campaignId = 2846779;
    // Check analytics endpoint for sequence breakdown
    console.log("=== Campaign Analytics ===");
    const analytics = await client.getCampaignAnalytics(campaignId);
    console.log(JSON.stringify(analytics, null, 2));
    // Check sequences endpoint
    console.log("\n=== Campaign Sequences ===");
    const sequences = await client.getCampaignSequences(campaignId);
    console.log(JSON.stringify(sequences, null, 2));
}
test().catch(console.error);
