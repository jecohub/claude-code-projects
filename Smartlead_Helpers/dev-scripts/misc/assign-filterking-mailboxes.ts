import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";
import * as fs from "fs";
import * as path from "path";

const config = getConfig();
const client = new SmartleadClient(config);

const CLIENT_ID = "13264"; // FilterKing
const MAILBOXES_CSV = "/Users/jericodelacruz/Desktop/Claude_Code_Projects/Smartlead_Helpers/2.Filterking/mailboxes-584ca41d-46b4-4e13-96bf-afb965eeb9ba-1772635037741.csv";
const TARGET_CAMPAIGN_IDS = [3001187, 3001188, 3001189, 3001190];

function parseMailboxesCsv(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const emails: string[] = [];
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts[0]?.trim()) {
      emails.push(parts[0].trim().toLowerCase());
    }
  }
  return emails;
}

async function assignEmailAccounts(campaignId: number, accountIds: number[]): Promise<boolean> {
  const url = `${config.baseUrl}/campaigns/${campaignId}/email-accounts?api_key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
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
  // Load email addresses from CSV
  const csvEmails = parseMailboxesCsv(MAILBOXES_CSV);
  console.log(`\nLoaded ${csvEmails.length} email addresses from CSV`);

  // Get all email accounts for FilterKing
  console.log(`Fetching all email accounts for client ${CLIENT_ID}...`);
  const allAccounts = await client.getClientEmailAccounts(CLIENT_ID);
  console.log(`Found ${allAccounts.length} total email accounts for client`);

  // Match by email address
  const csvEmailSet = new Set(csvEmails);
  const matchedAccounts = allAccounts.filter(a => csvEmailSet.has(a.from_email.toLowerCase()));
  const matchedIds = matchedAccounts.map(a => a.id);

  console.log(`Matched ${matchedIds.length} / ${csvEmails.length} mailboxes`);

  if (matchedIds.length === 0) {
    console.error("\n❌ No matching mailboxes found. Aborting.");
    process.exit(1);
  }

  const unmatched = csvEmails.filter(e => !allAccounts.some(a => a.from_email.toLowerCase() === e));
  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} emails not found in Smartlead (may not be connected yet):`);
    unmatched.forEach(e => console.log(`  - ${e}`));
  }

  // Assign to each target campaign
  console.log(`\nAssigning ${matchedIds.length} mailboxes to ${TARGET_CAMPAIGN_IDS.length} campaigns...`);
  let allSuccess = true;

  for (const campaignId of TARGET_CAMPAIGN_IDS) {
    process.stdout.write(`  Campaign ${campaignId}: assigning ${matchedIds.length} mailboxes... `);
    const ok = await assignEmailAccounts(campaignId, matchedIds);
    if (ok) {
      console.log("✓");
    } else {
      allSuccess = false;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  if (allSuccess) {
    console.log(`\n✅ Done. ${matchedIds.length} mailboxes assigned to all ${TARGET_CAMPAIGN_IDS.length} campaigns.`);
    console.log(`   Campaigns are NOT launched (as requested).`);
  } else {
    console.log(`\n⚠️  Some assignments failed. Check errors above.`);
  }
}

main().catch(console.error);
