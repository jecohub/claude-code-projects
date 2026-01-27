import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testSettingsCopy() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const sourceCampaignId = 2818135;
  const clientId = "77930";

  console.log("Testing campaign settings copy...\n");
  console.log(`Source Campaign: ${sourceCampaignId}`);

  // Fetch source settings
  const sourceDetails = await client.getCampaignDetails(sourceCampaignId);
  console.log("\n=== SOURCE CAMPAIGN SETTINGS ===");
  console.log(`track_settings: ${JSON.stringify(sourceDetails.track_settings)}`);
  console.log(`send_as_plain_text: ${sourceDetails.send_as_plain_text}`);
  console.log(`follow_up_percentage: ${sourceDetails.follow_up_percentage}`);
  console.log(`enable_ai_esp_matching: ${sourceDetails.enable_ai_esp_matching}`);

  // Duplicate campaign
  console.log("\n=== DUPLICATING CAMPAIGN ===");
  const result = await client.duplicateCampaign(
    sourceCampaignId,
    "TEST - Settings Copy Verification",
    clientId,
    {
      throwOnError: false,
      verifyAfterCopy: true,
      verbose: true,
      retryAttempts: 2,
    }
  );

  console.log(`\n=== DUPLICATION RESULT ===`);
  console.log(`Success: ${result.success}`);
  console.log(`New Campaign ID: ${result.campaignId}`);
  console.log(`Warnings: ${result.warnings.join(', ')}`);
  console.log(`Errors: ${result.errors.join(', ')}`);

  // Fetch new campaign settings
  const newDetails = await client.getCampaignDetails(result.campaignId);
  console.log("\n=== NEW CAMPAIGN SETTINGS ===");
  console.log(`track_settings: ${JSON.stringify(newDetails.track_settings)}`);
  console.log(`send_as_plain_text: ${newDetails.send_as_plain_text}`);
  console.log(`follow_up_percentage: ${newDetails.follow_up_percentage}`);
  console.log(`enable_ai_esp_matching: ${newDetails.enable_ai_esp_matching}`);

  // Compare
  console.log("\n=== COMPARISON ===");
  const trackMatch = JSON.stringify(newDetails.track_settings) === JSON.stringify(sourceDetails.track_settings);
  console.log(`✓ Track settings match source: ${trackMatch}`);
  console.log(`✓ Plain text setting copied: ${newDetails.send_as_plain_text === sourceDetails.send_as_plain_text}`);
  console.log(`✓ Follow-up percentage copied: ${newDetails.follow_up_percentage === sourceDetails.follow_up_percentage}`);
  console.log(`✓ AI ESP matching copied: ${newDetails.enable_ai_esp_matching === sourceDetails.enable_ai_esp_matching}`);
}

testSettingsCopy().catch(console.error);
