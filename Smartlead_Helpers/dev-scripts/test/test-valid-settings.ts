import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testValidSettings() {
  const config = getConfig();
  const client = new SmartleadClient(config);
  
  const testCampaignId = 2818171; // From previous test
  
  // Common track setting values to try
  const possibleValues = [
    ["EMAIL_OPEN"],
    ["LINK_CLICK"],
    ["EMAIL_OPEN", "LINK_CLICK"],
    ["DONT_LINK_CLICK"],
    [], // Empty array
  ];
  
  for (const value of possibleValues) {
    try {
      await client.updateCampaignSettings(testCampaignId, {
        track_settings: value,
      });
      console.log("✓ Valid:", JSON.stringify(value));
    } catch (error) {
      console.log("✗ Invalid:", JSON.stringify(value), "-", error instanceof Error ? error.message : String(error));
    }
  }
}

testValidSettings().catch(console.error);
