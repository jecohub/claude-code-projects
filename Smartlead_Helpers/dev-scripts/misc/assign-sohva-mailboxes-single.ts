import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";
import * as fs from "fs";

const config = getConfig();
const client = new SmartleadClient(config);

const CLIENT_ID = "77930";
const CAMPAIGN_IDS = [3005352, 3005353];
const MAILBOXES_CSV = "/Users/jericodelacruz/Desktop/Claude_Code_Projects/Smartlead_Helpers/4.Sohva/app (3).csv";

function parseMailboxesCsv(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const emails: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].split(",")[0]?.trim().replace(/^"|"$/g, "");
    if (raw) emails.push(raw.toLowerCase());
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

async function main() {
  const csvEmails = parseMailboxesCsv(MAILBOXES_CSV);
  console.log(`\nLoaded ${csvEmails.length} mailboxes from CSV`);

  const allAccounts = await getAllEmailAccounts(CLIENT_ID);
  const csvEmailSet = new Set(csvEmails);
  const matched = allAccounts.filter(a => csvEmailSet.has(a.from_email?.toLowerCase()));
  const matchedIds = matched.map(a => a.id);
  console.log(`Matched ${matched.length} / ${csvEmails.length} mailboxes`);

  if (matchedIds.length === 0) {
    console.error("No accounts matched. Aborting.");
    process.exit(1);
  }

  for (const campaignId of CAMPAIGN_IDS) {
    const existing = await client.getCampaignEmailAccounts(campaignId);
    const existingIds = new Set(existing.map((a: any) => a.id));
    const toAdd = matchedIds.filter(id => !existingIds.has(id));

    if (toAdd.length === 0) {
      console.log(`Campaign ${campaignId}: all ${matchedIds.length} mailboxes already assigned ✓`);
      continue;
    }

    process.stdout.write(`Adding ${toAdd.length} mailboxes to campaign ${campaignId}... `);
    const ok = await client.addEmailAccountsToCampaign(campaignId, toAdd);
    console.log(ok ? "✓" : "✗ FAILED");
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
