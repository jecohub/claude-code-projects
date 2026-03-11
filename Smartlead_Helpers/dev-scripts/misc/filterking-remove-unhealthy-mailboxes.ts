/**
 * Remove email accounts below 97% warmup reputation from all FilterKing
 * active campaigns created January 1, 2026 to present.
 *
 * Checks warmup_details.warmup_reputation directly from campaign email accounts.
 *
 * Usage:
 *   npx tsx dev-scripts/misc/filterking-remove-unhealthy-mailboxes.ts          # dry-run
 *   npx tsx dev-scripts/misc/filterking-remove-unhealthy-mailboxes.ts --commit  # live
 */

import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const CLIENT_ID = "13264";
const CLIENT_NAME = "FilterKing";
const HEALTH_THRESHOLD = 97;
const FROM_DATE = new Date("2026-01-01T00:00:00.000Z");
const DRY_RUN = !process.argv.includes("--commit");

function parseReputation(rep: string | undefined): number {
  if (!rep) return -1;
  const n = parseFloat(rep.replace("%", ""));
  return isNaN(n) ? -1 : n;
}

async function main() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  if (DRY_RUN) {
    console.log("\n⚠️  DRY-RUN MODE — no changes will be made. Pass --commit to execute.\n");
  } else {
    console.log("\n🚨 LIVE MODE — changes will be applied.\n");
  }

  // Get active campaigns since Jan 1 2026
  console.log(`Fetching active campaigns for ${CLIENT_NAME} (since ${FROM_DATE.toDateString()})...`);
  const { items: allCampaigns } = await client.listCampaigns(CLIENT_ID, { pageSize: 1000 });
  const activeCampaigns = (allCampaigns as any[]).filter((c) => {
    if (c.status !== "ACTIVE") return false;
    return new Date(c.created_at) >= FROM_DATE;
  });

  console.log(`Found ${activeCampaigns.length} active campaign(s).\n`);

  let totalRemoved = 0;
  let totalSkipped = 0;

  for (const campaign of activeCampaigns) {
    // Get campaign accounts — these include warmup_details.warmup_reputation
    const accounts = await client.getCampaignEmailAccounts(campaign.id);
    const toRemove = (accounts as any[]).filter((a) => {
      const score = parseReputation(a.warmup_details?.warmup_reputation);
      return score >= 0 && score < HEALTH_THRESHOLD;
    });

    if (toRemove.length === 0) {
      totalSkipped++;
      continue;
    }

    const ids = toRemove.map((a: any) => a.id);
    console.log(`Campaign [${campaign.id}] ${campaign.name}`);
    for (const a of toRemove) {
      const score = parseReputation(a.warmup_details?.warmup_reputation);
      console.log(`  - [${a.id}] ${a.from_email}  (${score}%)`);
    }

    if (!DRY_RUN) {
      const ok = await client.removeEmailAccountsFromCampaign(campaign.id, ids);
      if (ok) {
        console.log(`  ✅ Removed ${toRemove.length} account(s).`);
        totalRemoved += toRemove.length;
      } else {
        console.log(`  ❌ Failed to remove accounts from campaign ${campaign.id}.`);
      }
    } else {
      console.log(`  [dry-run] Would remove ${toRemove.length} account(s).`);
      totalRemoved += toRemove.length;
    }
    console.log();
  }

  console.log("================================================================================");
  if (DRY_RUN) {
    console.log(`  DRY-RUN COMPLETE`);
    console.log(`  Would remove ${totalRemoved} account assignment(s) across campaigns.`);
    console.log(`  ${totalSkipped} campaign(s) had no unhealthy accounts.`);
    console.log(`\n  Run with --commit to apply changes.`);
  } else {
    console.log(`  DONE`);
    console.log(`  Removed ${totalRemoved} account assignment(s) across campaigns.`);
    console.log(`  ${totalSkipped} campaign(s) had no unhealthy accounts.`);
  }
  console.log("================================================================================");
}

main().catch(console.error);
