import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const config = getConfig();
const client = new SmartleadClient(config);

const CLIENT_ID = "77930"; // Sohva Social
const DRY_RUN = process.argv.includes("--dry-run");

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
  if (DRY_RUN) console.log("🔍 DRY RUN — no changes will be made\n");

  console.log(`Fetching all Sohva (${CLIENT_ID}) campaigns...`);
  const result = await client.listCampaigns(CLIENT_ID, { pageSize: 1000 });
  const campaigns = result.items as any[];
  console.log(`Found ${campaigns.length} campaigns\n`);

  let totalFound = 0;
  let totalRemoved = 0;
  let campaignsAffected = 0;

  for (const campaign of campaigns) {
    const accounts = await client.getCampaignEmailAccounts(campaign.id);
    const verifastAccounts = accounts.filter(a =>
      a.from_email.toLowerCase().includes("verifast")
    );

    if (verifastAccounts.length === 0) continue;

    totalFound += verifastAccounts.length;
    campaignsAffected++;

    const ids = verifastAccounts.map(a => a.id);
    const emails = verifastAccounts.map(a => a.from_email).join(", ");

    if (DRY_RUN) {
      console.log(`  [${campaign.id}] ${campaign.name} (${campaign.status})`);
      verifastAccounts.forEach(a => console.log(`    - [${a.id}] ${a.from_email}`));
    } else {
      process.stdout.write(`  [${campaign.id}] ${campaign.name}: removing ${ids.length} verifast mailboxes (${emails})... `);
      const ok = await removeEmailAccounts(campaign.id, ids);
      if (ok) {
        console.log("✓");
        totalRemoved += ids.length;
      }
    }

    await new Promise(r => setTimeout(r, 150));
  }

  if (DRY_RUN) {
    console.log(`\n📋 Would remove ${totalFound} verifast mailboxes across ${campaignsAffected} campaigns`);
    console.log(`\nRun without --dry-run to apply changes.`);
  } else {
    console.log(`\n✅ Removed ${totalRemoved} verifast mailboxes across ${campaignsAffected} campaigns`);
  }
}

main().catch(console.error);
