import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

const CAMPAIGNS = [
  { id: 2856392, name: "Valid 1" },
  { id: 2856393, name: "Valid 2" },
  { id: 2856396, name: "Catchall 1" },
];

async function check() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  console.log("=== CHECKING CROSS-CAMPAIGN DUPLICATES ===\n");

  // Collect all emails per campaign
  const campaignEmails: Map<string, Set<string>> = new Map();
  const allEmails: Map<string, string[]> = new Map(); // email -> campaign names

  for (const campaign of CAMPAIGNS) {
    console.log(`Fetching leads from ${campaign.name}...`);
    const leads = await client.getCampaignLeads(campaign.id);
    const emails = new Set<string>();

    for (const item of leads) {
      const lead = item.lead || item;
      const email = lead.email?.toLowerCase();
      if (email) {
        emails.add(email);

        // Track which campaigns have this email
        if (!allEmails.has(email)) {
          allEmails.set(email, []);
        }
        allEmails.get(email)!.push(campaign.name);
      }
    }

    campaignEmails.set(campaign.name, emails);
    console.log(`  Found ${emails.size} unique emails`);
  }

  // Find duplicates across campaigns
  console.log("\n=== CROSS-CAMPAIGN DUPLICATES ===\n");
  let duplicateCount = 0;
  const duplicates: { email: string; campaigns: string[] }[] = [];

  for (const [email, campaigns] of allEmails) {
    if (campaigns.length > 1) {
      duplicateCount++;
      duplicates.push({ email, campaigns });
    }
  }

  if (duplicates.length === 0) {
    console.log("No duplicates found across campaigns.");
  } else {
    console.log(`Found ${duplicateCount} emails that appear in multiple campaigns:\n`);
    for (const dup of duplicates.slice(0, 20)) {
      console.log(`  ${dup.email} -> ${dup.campaigns.join(", ")}`);
    }
    if (duplicates.length > 20) {
      console.log(`  ... and ${duplicates.length - 20} more`);
    }
  }

  // Summary
  const totalUnique = allEmails.size;
  const totalWithDupes = Array.from(allEmails.values()).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total unique emails: ${totalUnique}`);
  console.log(`Total entries (with dupes): ${totalWithDupes}`);
  console.log(`Duplicate entries: ${totalWithDupes - totalUnique}`);
}

check().catch(console.error);
