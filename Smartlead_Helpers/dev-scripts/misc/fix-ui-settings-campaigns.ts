import { getConfig } from './src/config.js';
import { SmartleadClient } from './src/smartleadClient.js';

const campaignsToFix = [2821726, 2821727];
const sourceCampaignId = 2818135;

async function fixCampaigns() {
  console.log('=== FIXING UI-ONLY SETTINGS FOR CAMPAIGNS ===\n');

  const config = getConfig();
  const client = new SmartleadClient(config);

  for (const campaignId of campaignsToFix) {
    console.log(`\n🔧 Fixing campaign ${campaignId}...`);

    try {
      // @ts-ignore - accessing private method
      const result = await client['applyUiOnlySettingsGraphql'](
        sourceCampaignId,
        campaignId,
        config.webAuthToken
      );

      if (result.applied) {
        console.log(`✅ Successfully applied UI-only settings to campaign ${campaignId}`);
        console.log(`   ${result.details.join('\n   ')}`);
      } else {
        console.log(`❌ Failed to apply settings to campaign ${campaignId}`);
        console.log(`   ${result.details.join('\n   ')}`);
      }
    } catch (error) {
      console.error(`❌ Error fixing campaign ${campaignId}:`, error);
    }
  }

  console.log('\n✅ Done! Please verify in Smartlead UI that AI categories are now selected.');
}

fixCampaigns().catch(console.error);
