import { getConfig } from './src/config.js';
import { SmartleadClient } from './src/smartleadClient.js';

async function check() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const sourceDetails = await client.getCampaignDetails(2818135);
  console.log('\n=== SOURCE CAMPAIGN (2818135) ===');
  console.log('send_as_plain_text:', sourceDetails.send_as_plain_text);

  const newDetails = await client.getCampaignDetails(2821727);
  console.log('\n=== NEW CAMPAIGN (2821727) ===');
  console.log('send_as_plain_text:', newDetails.send_as_plain_text);

  console.log('\n=== COMPARISON ===');
  if (sourceDetails.send_as_plain_text === newDetails.send_as_plain_text) {
    console.log('✅ Settings match! Both have send_as_plain_text:', newDetails.send_as_plain_text);
  } else {
    console.log('❌ Settings DO NOT match!');
    console.log('   Source:', sourceDetails.send_as_plain_text);
    console.log('   New:', newDetails.send_as_plain_text);
  }
}

check().catch(console.error);
