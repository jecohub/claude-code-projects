import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

const CAMPAIGNS = [
  { id: 2856392, name: "Non-Outlook Valid 1", expected: 1859 },
  { id: 2856393, name: "Non-Outlook Valid 2", expected: 1107 },
  { id: 2856396, name: "Non-Outlook Catchall 1", expected: 1708 },  // Original was 1708, transferred 27 more
];

async function check() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  console.log("=== CAMPAIGN LEAD COUNTS ===\n");

  let total = 0;
  for (const campaign of CAMPAIGNS) {
    const leads = await client.getCampaignLeads(campaign.id);
    const diff = leads.length - campaign.expected;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    console.log(`${campaign.name}: ${leads.length} leads (expected ${campaign.expected}, ${diffStr})`);
    total += leads.length;
  }

  console.log(`\nTotal across all campaigns: ${total}`);
  console.log(`Original CSV had: 5,187 leads`);
}

check().catch(console.error);
