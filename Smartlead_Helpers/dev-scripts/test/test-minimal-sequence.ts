import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testMinimalSequence() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const testCampaignId = 2818288;

  // Test different minimal payloads
  const tests = [
    {
      name: "Just seq_number and delays",
      payload: [{
        seq_number: 1,
        seq_delay_details: { delayInDays: 1 }
      }]
    },
    {
      name: "With subject and body",
      payload: [{
        seq_number: 1,
        seq_delay_details: { delayInDays: 1 },
        subject: "Test",
        email_body: "Test"
      }]
    },
    {
      name: "With variant_distribution_type",
      payload: [{
        seq_number: 1,
        seq_delay_details: { delayInDays: 1 },
        subject: "Test",
        email_body: "Test",
        variant_distribution_type: "MANUAL_EQUAL"
      }]
    },
    {
      name: "Wrapped in sequences key",
      payload: {
        sequences: [{
          seq_number: 1,
          seq_delay_details: { delayInDays: 1 },
          subject: "Test",
          email_body: "Test"
        }]
      }
    },
    {
      name: "Plain object not array",
      payload: {
        seq_number: 1,
        seq_delay_details: { delayInDays: 1 },
        subject: "Test",
        email_body: "Test"
      }
    },
  ];

  for (const test of tests) {
    try {
      console.log(`\nTesting: ${test.name}`);
      await (client as any).postJson(`/campaigns/${testCampaignId}/sequences`, test.payload);
      console.log(`✓ SUCCESS!`);
      console.log(`  Campaign ${testCampaignId} now has sequences. Check Smartlead UI.`);
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`✗ Failed:`, msg.slice(0, 200));
    }
  }
}

testMinimalSequence().catch(console.error);
