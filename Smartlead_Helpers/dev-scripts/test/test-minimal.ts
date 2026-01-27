import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

const testCampaignId = 2786651; // Original campaign

async function testMinimal() {
  console.log("=== TEST MINIMAL UPLOAD ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  // Minimal lead - only required fields
  const minimalLeads = [
    {
      email: "test1@example.com",
      first_name: "John",
      last_name: "Doe",
    },
    {
      email: "test2@example.com",
      first_name: "Jane",
      last_name: "Smith",
    },
  ];

  console.log(`Testing upload of ${minimalLeads.length} minimal leads to campaign ${testCampaignId}...`);
  console.log("\nLeads:");
  console.log(JSON.stringify(minimalLeads, null, 2));

  try {
    const response = await client.addLeadsToCampaign(testCampaignId, minimalLeads, {
      ignoreGlobalBlockList: false,
    });

    console.log("\n✅ Upload successful!");
    console.log("Response:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.log("\n❌ Upload failed!");
    console.error("Error:", error);
  }
}

testMinimal().catch(console.error);
