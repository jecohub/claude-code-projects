import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";
import * as fs from "fs";

const config = getConfig();
const client = new SmartleadClient(config);

const CLIENT_ID = "127608"; // Iconic
const MAILBOXES_CSV = "/Users/jericodelacruz/Desktop/Claude_Code_Projects/Smartlead_Helpers/5.Iconic/mailboxes-584ca41d-46b4-4e13-96bf-afb965eeb9ba-1772451915212.csv";
const TARGET_CAMPAIGN_IDS = [3001374, 3001375, 3001376, 3001377];

function parseMailboxesCsv(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const emails: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts[0]?.trim()) emails.push(parts[0].trim().toLowerCase());
  }
  return emails;
}

async function getAllEmailAccounts(clientId: string): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const params = new URLSearchParams({ client_id: clientId, limit: String(limit), offset: String(offset) });
    const url = `${config.baseUrl}/email-accounts?api_key=${config.apiKey}&${params}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json() as any[];
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
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
  const csvEmails = parseMailboxesCsv(MAILBOXES_CSV);
  console.log(`\nLoaded ${csvEmails.length} email addresses from CSV`);

  console.log(`Fetching all Iconic email accounts (paginated)...`);
  const allAccounts = await getAllEmailAccounts(CLIENT_ID);
  console.log(`Found ${allAccounts.length} total accounts`);

  const csvEmailSet = new Set(csvEmails);
  const matched = allAccounts.filter(a => csvEmailSet.has(a.from_email?.toLowerCase()));
  const matchedIds = matched.map(a => a.id);

  console.log(`Matched ${matched.length} / ${csvEmails.length} mailboxes`);

  const unmatched = csvEmails.filter(e => !matched.some(a => a.from_email?.toLowerCase() === e));
  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} not found in Smartlead:`);
    unmatched.forEach(e => console.log(`  - ${e}`));
  }

  if (matchedIds.length === 0) {
    console.error("\n❌ No accounts found. Aborting.");
    process.exit(1);
  }

  console.log(`\nAssigning ${matchedIds.length} mailboxes to ${TARGET_CAMPAIGN_IDS.length} campaigns...`);
  for (const campaignId of TARGET_CAMPAIGN_IDS) {
    process.stdout.write(`  Campaign ${campaignId}... `);
    const ok = await assignEmailAccounts(campaignId, matchedIds);
    if (ok) console.log("✓");
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Done. Campaigns are NOT launched.`);
}

main().catch(console.error);
