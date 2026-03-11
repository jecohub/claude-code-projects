import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const config = getConfig();
const client = new SmartleadClient(config);

const sourceCampaignId = 2991918;
const targetCampaignIds = [2994645, 2994646, 2994648, 2994647];

async function assignEmailAccounts(campaignId: number, emailAccountIds: number[]): Promise<boolean> {
  const url = `${config.baseUrl}/campaigns/${campaignId}/email-accounts?api_key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_account_ids: emailAccountIds }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`  ✗ Failed (${response.status}): ${text}`);
    return false;
  }
  return true;
}

async function main() {
  // Get mailboxes from source campaign
  const accounts = await client.getCampaignEmailAccounts(sourceCampaignId);
  const ids = accounts.map(a => a.id);
  console.log(`\nFound ${ids.length} mailboxes on source campaign ${sourceCampaignId}`);

  for (const campaignId of targetCampaignIds) {
    process.stdout.write(`Assigning ${ids.length} mailboxes to campaign ${campaignId}... `);
    const ok = await assignEmailAccounts(campaignId, ids);
    if (ok) console.log("✓");
  }

  console.log("\nDone.");
}

main().catch(console.error);
