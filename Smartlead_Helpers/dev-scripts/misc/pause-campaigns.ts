import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const config = getConfig();
const client = new SmartleadClient(config);

const CLIENT_ID = "146909"; // Recho
const FROM_DATE = new Date("2026-01-01");

async function pauseCampaign(campaignId: number): Promise<boolean> {
  const url = `${config.baseUrl}/campaigns/${campaignId}/status?api_key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "START" }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`  ✗ Failed (${response.status}): ${text}`);
    return false;
  }
  return true;
}

async function main() {
  console.log(`\nFetching Recho campaigns (client ${CLIENT_ID})...`);
  const result = await client.listCampaigns(CLIENT_ID, { pageSize: 1000 });
  const all = result.items as any[];

  const toProcess = all.filter(c => new Date(c.created_at) >= FROM_DATE);
    const paused = toProcess.filter(c => c.status === "PAUSED");

  console.log(`Total campaigns: ${all.length}`);
  console.log(`Since Jan 1 2026: ${toProcess.length}`);
  console.log(`To activate (currently paused): ${paused.length}\n`);

  let activated = 0;
  let failed = 0;

  for (const campaign of paused) {
    process.stdout.write(`  [${campaign.id}] ${campaign.name}... `);
    const ok = await pauseCampaign(campaign.id);
    if (ok) { console.log("✓ activated"); activated++; }
    else { failed++; }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Activated: ${activated}`);
  if (failed > 0) console.log(`❌ Failed: ${failed}`);
}

main().catch(console.error);
