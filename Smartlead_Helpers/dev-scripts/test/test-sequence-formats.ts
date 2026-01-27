import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testSequenceFormats() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const testCampaignId = 2818288; // From previous test

  // Simple minimal sequence
  const minimalSequence = {
    seq_number: 1,
    seq_delay_details: { delayInDays: 1 },
    subject: "Test Subject",
    email_body: "Test Body",
    sequence_variants: null
  };

  // Try different payload formats
  const payloads = [
    { name: "Plain array", data: [minimalSequence] },
    { name: "Wrapped in 'sequences' key", data: { sequences: [minimalSequence] } },
    { name: "Wrapped in 'seq_data' key", data: { seq_data: [minimalSequence] } },
    { name: "Wrapped in 'email_sequences' key", data: { email_sequences: [minimalSequence] } },
    { name: "Single object (not array)", data: minimalSequence },
  ];

  for (const payload of payloads) {
    try {
      console.log(`\nTesting: ${payload.name}`);
      const response = await fetch(`${config.baseUrl}/campaigns/${testCampaignId}/sequences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload.data),
      });

      if (response.ok) {
        console.log(`✓ SUCCESS with ${payload.name}!`);
        const result = await response.text();
        console.log(`  Response:`, result);
        return;
      } else {
        const text = await response.text();
        console.log(`✗ Failed (${response.status}):`, text.slice(0, 150));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`✗ Error:`, msg);
    }
  }
}

testSequenceFormats().catch(console.error);
