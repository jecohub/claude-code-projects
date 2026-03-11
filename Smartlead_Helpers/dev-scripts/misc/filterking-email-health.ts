/**
 * Check FilterKing active campaigns and email accounts with warmup reputation below 97%.
 * Uses warmup_details.warmup_reputation from the email accounts API.
 * Usage: npx tsx dev-scripts/misc/filterking-email-health.ts
 */

import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const CLIENT_ID = "13264";
const CLIENT_NAME = "FilterKing";
const HEALTH_THRESHOLD = 97;
const FROM_DATE = new Date("2026-01-01T00:00:00.000Z");

function parseReputation(rep: string | undefined): number {
  if (!rep) return -1;
  const n = parseFloat(rep.replace("%", ""));
  return isNaN(n) ? -1 : n;
}

async function main() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  // Get active campaigns since Jan 1 2026
  console.log(`\nFetching active campaigns for ${CLIENT_NAME} (since ${FROM_DATE.toDateString()})...`);
  const { items: allCampaigns } = await client.listCampaigns(CLIENT_ID, { pageSize: 1000 });
  const activeCampaigns = (allCampaigns as any[]).filter((c) => {
    if (c.status !== "ACTIVE") return false;
    return new Date(c.created_at) >= FROM_DATE;
  });

  if (activeCampaigns.length === 0) {
    console.log("No active campaigns found.");
    return;
  }

  console.log(`Found ${activeCampaigns.length} active campaign(s):\n`);
  for (const c of activeCampaigns) {
    console.log(`  [${c.id}] ${c.name}`);
  }

  // Get all email accounts for the client (includes warmup_details)
  console.log(`\nFetching email accounts for ${CLIENT_NAME}...`);
  const allAccounts = await client.getClientEmailAccounts(CLIENT_ID);

  // Collect unique IDs from active campaigns
  const activeCampaignAccountIds = new Set<number>();
  for (const campaign of activeCampaigns) {
    const accounts = await client.getCampaignEmailAccounts(campaign.id);
    for (const acc of accounts) {
      activeCampaignAccountIds.add(acc.id);
    }
  }

  // Filter to accounts used in active campaigns
  const relevantAccounts = allAccounts.filter((a) => activeCampaignAccountIds.has(a.id));

  // Parse reputation scores
  const results = relevantAccounts.map((a) => ({
    id: a.id,
    email: a.from_email,
    score: parseReputation(a.warmup_details?.warmup_reputation),
    warmupStatus: a.warmup_details?.status ?? "UNKNOWN",
  }));

  // Sort: below threshold first (asc), then healthy (desc)
  results.sort((a, b) => {
    const aBad = a.score >= 0 && a.score < HEALTH_THRESHOLD;
    const bBad = b.score >= 0 && b.score < HEALTH_THRESHOLD;
    if (aBad !== bBad) return aBad ? -1 : 1;
    return a.score - b.score;
  });

  const below = results.filter((r) => r.score >= 0 && r.score < HEALTH_THRESHOLD);
  const good = results.filter((r) => r.score >= HEALTH_THRESHOLD);
  const unavailable = results.filter((r) => r.score === -1);

  console.log("\n================================================================================");
  console.log(`  ${CLIENT_NAME.toUpperCase()} WARMUP REPUTATION  (threshold: ${HEALTH_THRESHOLD}%)`);
  console.log(`  Campaigns from:     ${FROM_DATE.toDateString()} to present`);
  console.log("================================================================================");
  console.log(`  Active campaigns:   ${activeCampaigns.length}`);
  console.log(`  Total accounts:     ${results.length}`);
  console.log(`  Below ${HEALTH_THRESHOLD}%:         ${below.length}`);
  console.log(`  At or above ${HEALTH_THRESHOLD}%:   ${good.length}`);
  console.log(`  Score unavailable:  ${unavailable.length}`);
  console.log("================================================================================\n");

  if (below.length > 0) {
    console.log(`⚠️  ACCOUNTS BELOW ${HEALTH_THRESHOLD}% (${below.length}):`);
    console.log("─".repeat(60));
    for (const r of below) {
      console.log(`  [${r.id}] ${r.email.padEnd(42)} ${r.score}%`);
    }
    console.log();
  } else {
    console.log(`✅ All accounts are at or above ${HEALTH_THRESHOLD}%.\n`);
  }

  if (good.length > 0) {
    console.log(`✅ HEALTHY ACCOUNTS (${good.length}):`);
    console.log("─".repeat(60));
    for (const r of good) {
      console.log(`  [${r.id}] ${r.email.padEnd(42)} ${r.score}%`);
    }
    console.log();
  }

  if (unavailable.length > 0) {
    console.log(`❓ WARMUP REPUTATION UNAVAILABLE (${unavailable.length}):`);
    console.log("─".repeat(60));
    for (const r of unavailable) {
      console.log(`  [${r.id}] ${r.email}  [warmup: ${r.warmupStatus}]`);
    }
    console.log();
  }
}

main().catch(console.error);
