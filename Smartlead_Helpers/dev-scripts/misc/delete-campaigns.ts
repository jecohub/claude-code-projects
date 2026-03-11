import { getConfig } from "../../src/core/config.js";

const campaignsToDelete = [
  2992705,
  2992706,
  2992708,
  2992707,
  2992710,
  2992709,
  2992712,
  2992711,
  2992713,
  2992714,
  2992715,
];

async function deleteCampaign(campaignId: number, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://server.smartlead.ai/api/v1/campaigns/${campaignId}?api_key=${apiKey}`,
      { method: "DELETE" }
    );
    
    if (response.ok) {
      console.log(`✓ Deleted campaign ${campaignId}`);
      return true;
    } else {
      const text = await response.text();
      console.log(`✗ Failed to delete ${campaignId}: ${response.status} - ${text}`);
      return false;
    }
  } catch (error) {
    console.log(`✗ Error deleting ${campaignId}: ${error}`);
    return false;
  }
}

async function main() {
  const config = getConfig();
  console.log(`\nDeleting ${campaignsToDelete.length} campaigns...\n`);
  
  let deleted = 0;
  let failed = 0;
  
  for (const campaignId of campaignsToDelete) {
    const success = await deleteCampaign(campaignId, config.apiKey);
    if (success) deleted++;
    else failed++;
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n✅ Deleted: ${deleted}`);
  console.log(`❌ Failed: ${failed}`);
}

main().catch(console.error);
