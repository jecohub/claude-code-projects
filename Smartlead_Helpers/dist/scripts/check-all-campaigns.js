import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";
const campaignIds = [2816471, 2816344, 2816485];
async function checkAllCampaigns() {
    console.log("=== CHECKING ALL CAMPAIGN LEADS ===\n");
    const config = getConfig();
    const client = new SmartleadClient(config);
    for (const campaignId of campaignIds) {
        try {
            const leadsData = await client.getJson(`/campaigns/${campaignId}/leads`, new URLSearchParams({ limit: "1", offset: "0" }));
            console.log(`Campaign ${campaignId}:`);
            console.log(`  Total Leads: ${leadsData.total_leads}`);
            if (leadsData.data && leadsData.data.length > 0) {
                console.log(`  First lead email: ${leadsData.data[0].lead.email}`);
                console.log(`  Created at: ${leadsData.data[0].created_at}`);
            }
            console.log("");
        }
        catch (error) {
            console.log(`Campaign ${campaignId}:`);
            console.log(`  ❌ Error: ${error.message}`);
            console.log("");
        }
    }
}
checkAllCampaigns().catch(console.error);
