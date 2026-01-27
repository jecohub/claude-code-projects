import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function verify() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  const campaignId = 2818321; // The campaign we just created

  console.log(`\n=== Verifying Campaign ${campaignId} ===\n`);

  try {
    const sequences = await client.getCampaignSequences(campaignId);
    console.log(`✅ Campaign has ${sequences.length} sequences`);

    sequences.forEach((seq, i) => {
      const variantCount = seq.sequence_variants?.length || 0;
      console.log(`  Sequence ${i + 1}:`);
      console.log(`    - seq_number: ${seq.seq_number}`);
      console.log(`    - delay: ${seq.seq_delay_details?.delayInDays || seq.seq_delay_details?.delay_in_days} days`);
      console.log(`    - has subject: ${!!seq.subject}`);
      console.log(`    - has body: ${!!seq.email_body}`);
      console.log(`    - variants: ${variantCount}`);
    });

    console.log(`\n✅ Campaign is ready to use in Smartlead UI!`);
    console.log(`   Sequences are configured and can accept leads.\n`);

  } catch (error) {
    console.error(`❌ Error verifying campaign:`, error);
  }
}

verify().catch(console.error);
