import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";
const testCampaignId = 2816471;
async function testFreshLeads() {
    console.log("=== TEST FRESH UNIQUE LEADS ===\n");
    const config = getConfig();
    const client = new SmartleadClient(config);
    // Create unique leads with timestamp
    const timestamp = Date.now();
    const freshLeads = [
        {
            email: `unique.test.${timestamp}.1@example.com`,
            first_name: "Unique",
            last_name: "Test1",
        },
        {
            email: `unique.test.${timestamp}.2@example.com`,
            first_name: "Unique",
            last_name: "Test2",
        },
        {
            email: `unique.test.${timestamp}.3@example.com`,
            first_name: "Unique",
            last_name: "Test3",
        },
    ];
    console.log(`Testing upload of ${freshLeads.length} unique leads to campaign ${testCampaignId}...`);
    console.log("\nLeads:");
    console.log(JSON.stringify(freshLeads, null, 2));
    try {
        // Get campaign details before upload
        const beforeDetails = await client.getCampaignDetails(testCampaignId);
        console.log(`\n📊 Before upload: ${beforeDetails.total_leads || 0} total leads`);
        const response = await client.addLeadsToCampaign(testCampaignId, freshLeads, {
            ignoreGlobalBlockList: false,
        });
        console.log("\n✅ Upload response:");
        console.log(JSON.stringify(response, null, 2));
        // Get campaign details after upload
        const afterDetails = await client.getCampaignDetails(testCampaignId);
        console.log(`\n📊 After upload: ${afterDetails.total_leads || 0} total leads`);
        console.log(`   Active: ${afterDetails.active_leads || 0}`);
        console.log(`   Paused: ${afterDetails.paused_leads || 0}`);
        console.log(`   Status: ${afterDetails.status}`);
    }
    catch (error) {
        console.log("\n❌ Upload failed!");
        console.error("Error:", error);
    }
}
testFreshLeads().catch(console.error);
