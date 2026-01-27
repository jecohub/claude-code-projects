import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";

const testCampaignId = 2816471;

async function debugApiRequest() {
  console.log("=== DEBUG API REQUEST ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  // Test with absolute minimal lead
  const minimalLead = {
    email: "test-debug@example.com",
    first_name: "Test",
    last_name: "User",
  };

  console.log("Lead to upload:");
  console.log(JSON.stringify(minimalLead, null, 2));

  try {
    // Temporarily patch postJson to log the request
    const originalPostJson = (client as any).postJson.bind(client);
    (client as any).postJson = async function(endpoint: string, body: any) {
      console.log("\n📤 API Request:");
      console.log("Endpoint:", endpoint);
      console.log("Body:", JSON.stringify(body, null, 2));

      const result = await originalPostJson(endpoint, body);

      console.log("\n📥 API Response:");
      console.log(JSON.stringify(result, null, 2));

      return result;
    };

    const response = await client.addLeadsToCampaign(testCampaignId, [minimalLead], {
      ignoreGlobalBlockList: false,
      ignoreUnsubscribeList: false,
      ignoreDuplicateLeadsInOtherCampaign: false,
    });

    console.log("\n✅ Final Result:");
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log("\n❌ Request Failed");
    console.error("Error:", error);
  }
}

debugApiRequest().catch(console.error);
