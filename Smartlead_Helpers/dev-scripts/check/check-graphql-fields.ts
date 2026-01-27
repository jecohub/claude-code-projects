import { getConfig } from './src/config.js';
import { SmartleadClient } from './src/smartleadClient.js';

async function checkGraphQLFields() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const sourceCampaignId = 2818135;

  // Use internal method to fetch via GraphQL
  const query = `
    query getCampaignAllSettings($id: Int!) {
      email_campaigns_by_pk(id: $id) {
        id
        name
        send_as_plain_text
        ai_categorisation_options
        auto_categorise_reply
        bounce_autopause_threshold
        out_of_office_detection_settings
      }
    }
  `;

  try {
    // @ts-ignore - accessing private method for debugging
    const result = await client['postGraphql']({
      operationName: 'getCampaignAllSettings',
      variables: { id: sourceCampaignId },
      query,
    });

    console.log('\n=== SOURCE CAMPAIGN GRAPHQL FIELDS ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

checkGraphQLFields().catch(console.error);
