import { getConfig } from "../../src/core/config.js";

const config = getConfig();

const TARGET_EMAILS = [
  "rickh@filterkingsuite.info",
  "rick.h@filterkingdrive.info",
  "rick@globalfilterking.info",
  "rickh@filterkingcontrol.info",
  "rick@filterkingreach.info",
  "rick.h@filterkingmanager.info",
  "rickh@valuefilterking.info",
  "rickh@filterkingcloud.info",
  "rickh@filterkingstart.info",
  "rickh@modernfilterking.info",
  "rickh@filterkingcenter.info",
];

const TARGET_CAMPAIGN_IDS = [3001187, 3001188, 3001189, 3001190];

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
    console.log(`  Fetched ${all.length} so far (page offset ${offset})...`);
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
  const targetSet = new Set(TARGET_EMAILS.map(e => e.toLowerCase()));

  console.log(`\nFetching all email accounts (paginated)...`);
  const all = await getAllEmailAccounts("13264");
  console.log(`Found ${all.length} total accounts`);

  const matched = all.filter(a => targetSet.has(a.from_email?.toLowerCase()));
  const matchedIds = matched.map(a => a.id);

  console.log(`Matched ${matched.length} / ${TARGET_EMAILS.length} target mailboxes`);
  matched.forEach(a => console.log(`  ✓ [${a.id}] ${a.from_email}`));

  const unmatched = TARGET_EMAILS.filter(e => !matched.some(a => a.from_email?.toLowerCase() === e));
  if (unmatched.length > 0) {
    console.log(`\n⚠️  Still not found (${unmatched.length}):`);
    unmatched.forEach(e => console.log(`  - ${e}`));
  }

  if (matchedIds.length === 0) {
    console.error("\n❌ No accounts found to assign. Aborting.");
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
