import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const config = getConfig();
const client = new SmartleadClient(config);

const CLIENTS = [
  { id: "13264",  name: "FilterKing" },
  { id: "77930",  name: "Sohva Social" },
  { id: "127608", name: "Iconic" },
  { id: "128520", name: "SwayyEm" },
  { id: "146909", name: "Recho" },
];

function isOutlookCampaign(name: string): boolean {
  const lower = name.toLowerCase();
  // Must contain "outlook" but NOT "non-outlook" or "non outlook"
  return lower.includes("outlook") && !lower.includes("non-outlook") && !lower.includes("non outlook") && !lower.includes("nonxoutlook");
}

async function main() {
  console.log(`\nChecking Outlook campaigns for ${CLIENTS.length} clients...\n`);
  console.log("=".repeat(70));

  for (const c of CLIENTS) {
    const result = await client.listCampaigns(c.id);
    const allCampaigns = result.items as any[];

    const activeCampaigns = allCampaigns.filter(
      (camp: any) => camp.status === "ACTIVE" || camp.status === "active"
    );

    const outlookCampaigns = activeCampaigns.filter((camp: any) =>
      isOutlookCampaign(camp.name || "")
    );

    if (outlookCampaigns.length === 0) {
      console.log(`\n${c.name} (${c.id})`);
      console.log(`  No active Outlook campaigns found.`);
      continue;
    }

    // Collect unique mailbox IDs across all Outlook campaigns
    const allMailboxIds = new Set<number>();
    const campaignDetails: { name: string; id: number; mailboxCount: number }[] = [];

    for (const camp of outlookCampaigns) {
      const accounts = await client.getCampaignEmailAccounts(camp.id);
      for (const a of accounts) allMailboxIds.add(a.id);
      campaignDetails.push({ name: camp.name, id: camp.id, mailboxCount: accounts.length });
      await new Promise(r => setTimeout(r, 150));
    }

    console.log(`\n${c.name} (${c.id})`);
    console.log(`  Active Outlook campaigns: ${outlookCampaigns.length}`);
    console.log(`  Unique mailboxes across those campaigns: ${allMailboxIds.size}`);
    console.log(`  Campaigns:`);
    for (const d of campaignDetails) {
      console.log(`    [${d.id}] ${d.name} — ${d.mailboxCount} mailboxes`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("Done.");
}

main().catch(console.error);
