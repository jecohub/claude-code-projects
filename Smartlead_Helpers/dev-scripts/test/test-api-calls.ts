import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testAPIs() {
  const config = getConfig();
  const client = new SmartleadClient(config);
  
  // Test 1: Create a simple campaign
  console.log("Creating test campaign...");
  const campaign = await client.createCampaign({
    name: "Test Campaign - DELETE ME",
    client_id: "77930"
  });
  
  console.log("Created campaign:", campaign.id);
  
  // Test 2: Try updating settings with valid values
  console.log("\nTesting settings update...");
  try {
    await client.updateCampaignSettings(campaign.id, {
      track_settings: ["DONT_EMAIL_OPEN", "DONT_LINK_CLICK"], // Try the original value
    });
    console.log("✓ Settings updated successfully");
  } catch (error) {
    console.log("✗ Settings failed:", error instanceof Error ? error.message : String(error));
    
    // Try with different value
    try {
      await client.updateCampaignSettings(campaign.id, {
        track_settings: "DONT_EMAIL_OPEN", // Try string instead of array
      });
      console.log("✓ Settings updated with string value");
    } catch (error2) {
      console.log("✗ String value also failed:", error2 instanceof Error ? error2.message : String(error2));
    }
  }
  
  console.log("\nTest complete. Campaign ID:", campaign.id);
  console.log("You can manually delete this campaign from Smartlead.");
}

testAPIs().catch(console.error);
