import { getConfig } from "../../src/core/config.js";

const config = getConfig();
const apiKey = config.apiKey;
const campaigns = [2905520, 2905521, 2905523, 2905522, 2905525, 2905524, 2905526];

async function main() {
  let total = 0;
  for (const id of campaigns) {
    const url = `https://server.smartlead.ai/api/v1/campaigns/${id}/leads?api_key=${apiKey}&offset=0&limit=1`;
    const resp = await fetch(url);
    const data = await resp.json();
    const count = data.total_leads ?? data.totalCount ?? "?";
    total += typeof count === "number" ? count : 0;
    console.log(`Campaign ${id}: ${count} leads`);
  }
  console.log(`\nTotal: ${total}`);
}

main().catch(console.error);
