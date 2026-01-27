import { getConfig } from './src/config.js';
import { SmartleadClient } from './src/smartleadClient.js';

async function trySetPlainText() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const testCampaignId = 2821727;

  console.log('=== ATTEMPTING TO SET PLAIN TEXT VIA DIFFERENT METHODS ===\n');

  // Method 1: Try via GraphQL with different field name variations
  const fieldNamesToTry = [
    'force_plain_text',
    'enforce_plain_text',
    'plain_text_enforced',
    'content_type_plain_text',
    'force_content_type',
  ];

  for (const fieldName of fieldNamesToTry) {
    console.log(`Trying field name: ${fieldName}...`);
    try {
      const mutation = `
        mutation updateCampaign($id: Int!, $changes: email_campaigns_set_input!) {
          update_email_campaigns_by_pk(pk_columns: {id: $id}, _set: $changes) {
            id
            __typename
          }
        }
      `;

      // @ts-ignore
      await client['postGraphql']({
        operationName: 'updateCampaign',
        variables: {
          id: testCampaignId,
          changes: { [fieldName]: true }
        },
        query: mutation,
      });

      console.log(`  ✅ Success with field: ${fieldName}\n`);
      break;
    } catch (error: any) {
      console.log(`  ❌ Failed: ${error.message}\n`);
    }
  }

  // Method 2: Try updating via public API
  console.log('Trying via public API updateCampaignSettings...');
  try {
    await client.updateCampaignSettings(testCampaignId, {
      send_as_plain_text: true,
      // Try adding hypothetical fields
      force_plain_text: true,
      enforce_plain_text: true,
    } as any);
    console.log('  ✅ Public API update succeeded\n');
  } catch (error: any) {
    console.log(`  ❌ Public API failed: ${error.message}\n`);
  }

  console.log('=== CONCLUSION ===');
  console.log('If no method worked, the nested checkbox may be:');
  console.log('1. UI-only (doesn\'t actually get saved)');
  console.log('2. Derived automatically from send_as_plain_text: true');
  console.log('3. Controlled by a private API endpoint not exposed to us');
  console.log('4. A browser-side setting that doesn\'t persist');
}

trySetPlainText().catch(console.error);
