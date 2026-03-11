import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const config = getConfig();
const client = new SmartleadClient(config);

const newCampaignIds = [2994645, 2994646, 2994648, 2994647];
const sourceCampaignId = 2991918;

async function main() {
  const sourceAccounts = await client.getCampaignEmailAccounts(sourceCampaignId);
  console.log(`\nSource campaign ${sourceCampaignId}: ${sourceAccounts.length} accounts`);
  sourceAccounts.forEach(a => console.log(`  [${a.id}] ${a.from_email}`));

  for (const id of newCampaignIds) {
    const accounts = await client.getCampaignEmailAccounts(id);
    console.log(`\nCampaign ${id}: ${accounts.length} accounts`);
    accounts.forEach(a => console.log(`  [${a.id}] ${a.from_email}`));
  }
}

main().catch(console.error);
