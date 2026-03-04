import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";
async function fetchCampaignSettings() {
    const config = getConfig();
    const client = new SmartleadClient(config);
    const campaignId = 2818135;
    console.log(`Fetching campaign ${campaignId} details...\n`);
    try {
        const details = await client.getCampaignDetails(campaignId);
        console.log("=== CAMPAIGN SETTINGS ===");
        console.log(JSON.stringify(details, null, 2));
    }
    catch (error) {
        console.error("Error:", error);
    }
}
fetchCampaignSettings();
