import { getConfig } from './src/config.js';
import { SmartleadClient } from './src/smartleadClient.js';

async function compareCampaigns() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const sourceCampaignId = 2818135;
  const newCampaignId = 2821727;

  console.log('=== COMPARING CAMPAIGNS ===\n');

  // Get both via public API
  const sourceDetails = await client.getCampaignDetails(sourceCampaignId);
  const newDetails = await client.getCampaignDetails(newCampaignId);

  console.log('Source Campaign (2818135):');
  console.log('  send_as_plain_text:', sourceDetails.send_as_plain_text);
  console.log('  track_settings:', JSON.stringify(sourceDetails.track_settings));
  console.log('  All fields:', Object.keys(sourceDetails).sort());

  console.log('\nNew Campaign (2821727):');
  console.log('  send_as_plain_text:', newDetails.send_as_plain_text);
  console.log('  track_settings:', JSON.stringify(newDetails.track_settings));
  console.log('  All fields:', Object.keys(newDetails).sort());

  console.log('\n=== DIFFERENCES ===');
  const allKeys = new Set([...Object.keys(sourceDetails), ...Object.keys(newDetails)]);
  for (const key of Array.from(allKeys).sort()) {
    const sourceVal = JSON.stringify((sourceDetails as any)[key]);
    const newVal = JSON.stringify((newDetails as any)[key]);
    if (sourceVal !== newVal && key !== 'id' && key !== 'name' && key !== 'created_at' && key !== 'updated_at') {
      console.log(`  ${key}:`);
      console.log(`    Source: ${sourceVal}`);
      console.log(`    New:    ${newVal}`);
    }
  }

  // Try GraphQL to see if there are fields the public API doesn't show
  console.log('\n=== GRAPHQL COMPARISON ===');

  const query = `
    query getCampaign($id: Int!) {
      email_campaigns_by_pk(id: $id) {
        id
        send_as_plain_text
        __typename
      }
    }
  `;

  // @ts-ignore
  const sourceGql = await client['postGraphql']({
    operationName: 'getCampaign',
    variables: { id: sourceCampaignId },
    query,
  });

  // @ts-ignore
  const newGql = await client['postGraphql']({
    operationName: 'getCampaign',
    variables: { id: newCampaignId },
    query,
  });

  console.log('Source (GraphQL):', JSON.stringify(sourceGql, null, 2));
  console.log('New (GraphQL):', JSON.stringify(newGql, null, 2));
}

compareCampaigns().catch(console.error);
