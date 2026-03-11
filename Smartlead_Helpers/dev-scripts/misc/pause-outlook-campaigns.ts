import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const config = getConfig();
const client = new SmartleadClient(config);

// All active Outlook campaigns across FilterKing, Sohva, Iconic, SwayyEm, Recho
const OUTLOOK_CAMPAIGN_IDS: number[] = [
  // FilterKing (13264) — 27 campaigns
  3001190, 2976193, 2976192, 2975481, 2975478, 2952830,
  2667451, 2667449, 2667447, 2667445, 2667443,
  2654387, 2628477, 2628438, 2614470, 2614417,
  2561891, 2561877, 2561766, 2546362, 2546332,
  2537781, 2537597, 2531636, 2531454, 2476781, 2463708,

  // Sohva Social (77930) — 19 campaigns
  2954037, 2934843,
  2669402, 2669401, 2669400,
  2575849, 2575835, 2575792, 2575785,
  2521114, 2521063, 2521003, 2520983,
  2500177, 2500128, 2496411, 2489072, 2489053, 2480991,

  // Iconic (127608) — 6 campaigns
  2923967, 2550186, 2539895, 2530464, 2490233, 2490232,

  // SwayyEm (128520) — 15 campaigns
  2994645, 2932031, 2738269,
  2676347, 2676339, 2650361, 2650248,
  2623218, 2623150, 2621282, 2621192,
  2600114, 2595495, 2591450, 2542468,

  // Recho (146909) — 20 campaigns
  2992553, 2992354, 2992351,
  2971103, 2971101, 2971100, 2971070, 2971068,
  2967460, 2967408,
  2944903, 2944902, 2944833, 2944831, 2944784, 2944783,
  2923238, 2923175, 2789340, 2789339,
];

async function main() {
  console.log(`\nPausing ${OUTLOOK_CAMPAIGN_IDS.length} Outlook campaigns across all clients...\n`);

  let paused = 0;
  let failed = 0;

  for (const id of OUTLOOK_CAMPAIGN_IDS) {
    process.stdout.write(`  Campaign ${id}... `);
    const url = `${config.baseUrl}/campaigns/${id}/status?api_key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED" }),
    });
    const ok = res.ok;
    if (ok) { console.log("✓ paused"); paused++; }
    else { const text = await res.text(); console.log(`✗ FAILED (${res.status}): ${text.slice(0, 200)}`); failed++; }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Paused: ${paused}`);
  if (failed > 0) console.log(`❌ Failed: ${failed}`);
  console.log("Done.");
}

main().catch(console.error);
