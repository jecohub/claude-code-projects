import { getConfig } from "./src/config.js";

const campaignsToDelete = [
  2856395  // Empty campaign after lead transfer
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
