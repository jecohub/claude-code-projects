import { getConfig } from './src/config.js';
import { SmartleadClient } from './src/smartleadClient.js';

async function exploreAllFields() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const sourceCampaignId = 2818135;

  // Try to get as many fields as possible
  const queries = [
    // Query 1: Try common plain text field names
    `query test1($id: Int!) {
      email_campaigns_by_pk(id: $id) {
        id
        send_as_plain_text
        force_plain_text
        plain_text_mode
        content_type
        force_content_type
        email_content_type
      }
    }`,

    // Query 2: Get all available fields via introspection-style query
    `query test2($id: Int!) {
      email_campaigns_by_pk(id: $id) {
        id
        name
        send_as_plain_text
        track_settings
        stop_lead_settings
        unsubscribe_text
        follow_up_percentage
        enable_ai_esp_matching
      }
    }`,
  ];

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n=== Testing Query ${i + 1} ===`);
    try {
      // @ts-ignore
      const result = await client['postGraphql']({
        operationName: `test${i + 1}`,
        variables: { id: sourceCampaignId },
        query: queries[i],
      });
      console.log('✅ Success!');
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      console.log('❌ Error:', error.message);
    }
  }

  // Let's also check what the public API returns for the same campaign
  console.log('\n=== PUBLIC API RESPONSE ===');
  const details = await client.getCampaignDetails(sourceCampaignId);
  console.log(JSON.stringify(details, null, 2).slice(0, 2000));
}

exploreAllFields().catch(console.error);
