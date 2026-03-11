import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const config = getConfig();
const client = new SmartleadClient(config);

const CLIENT_ID = "146909"; // Recho

async function removeEmailAccounts(campaignId: number, accountIds: number[]): Promise<boolean> {
  const url = `${config.baseUrl}/campaigns/${campaignId}/email-accounts?api_key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_account_ids: accountIds }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`  ✗ Failed (${response.status}): ${text}`);
    return false;
  }
  return true;
}

async function main() {
  console.log(`\nFetching Recho paused campaigns...`);
  const result = await client.listCampaigns(CLIENT_ID, { pageSize: 1000 });
  const paused = (result.items as any[]).filter(c => c.status === "PAUSED");

  console.log(`Found ${paused.length} paused campaigns\n`);

  let totalRemoved = 0;
  let campaignsAffected = 0;

  for (const campaign of paused) {
    const accounts = await client.getCampaignEmailAccounts(campaign.id);
    const swayyemAccounts = accounts.filter(a => a.from_email.toLowerCase().includes("swayyem"));

    if (swayyemAccounts.length === 0) continue;

    const ids = swayyemAccounts.map(a => a.id);
    process.stdout.write(`  [${campaign.id}] ${campaign.name}: removing ${ids.length} swayyem mailboxes... `);
    const ok = await removeEmailAccounts(campaign.id, ids);
    if (ok) {
      console.log("✓");
      totalRemoved += ids.length;
      campaignsAffected++;
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n✅ Removed ${totalRemoved} swayyem mailboxes across ${campaignsAffected} campaigns`);
}

main().catch(console.error);
