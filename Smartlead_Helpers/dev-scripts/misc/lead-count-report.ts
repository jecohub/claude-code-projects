/**
 * Emails sent report (Dec 15, 2025 – Jan 31, 2026) for the 5 main clients.
 *
 * Sums emailStats.sent from campaigns created within the date range.
 *
 * Usage: npx tsx dev-scripts/misc/lead-count-report.ts
 */

import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";

const CLIENTS = [
  { id: "13264", name: "FilterKing" },
  { id: "127608", name: "Iconic" },
  { id: "128520", name: "SwayyEm" },
  { id: "77930", name: "Sohva Social" },
  { id: "146909", name: "Recho" },
];

const FROM_DATE = new Date("2025-12-15T00:00:00.000Z");
const TO_DATE = new Date("2026-01-31T23:59:59.999Z");

interface ClientResult {
  clientId: string;
  clientName: string;
  campaigns: { name: string; sent: number }[];
  totalSent: number;
}

async function main() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  console.log("==========================================================");
  console.log("  EMAILS SENT REPORT  (Dec 15, 2025 – Jan 31, 2026)");
  console.log("==========================================================\n");

  const results: ClientResult[] = [];

  for (const { id, name } of CLIENTS) {
    console.log(`Fetching data for ${name} (${id})...`);

    const report = await client.getCampaignReport(id, FROM_DATE);

    // Client-side filter by TO_DATE
    const filtered = report.campaigns.filter(
      (c) => new Date(c.createdAt) <= TO_DATE,
    );

    if (filtered.length === 0) {
      console.log(`  No campaigns in date range.\n`);
      results.push({ clientId: id, clientName: name, campaigns: [], totalSent: 0 });
      continue;
    }

    let totalSent = 0;
    const campaigns: { name: string; sent: number }[] = [];

    for (const c of filtered) {
      const sent = c.emailStats.sent;
      campaigns.push({ name: c.campaignName, sent });
      totalSent += sent;
    }

    results.push({ clientId: id, clientName: name, campaigns, totalSent });
    console.log(`  ${filtered.length} campaign(s), ${totalSent.toLocaleString()} emails sent.\n`);
  }

  // ── Final Report ──
  console.log("\n==========================================================");
  console.log("  EMAILS SENT (Dec 15, 2025 – Jan 31, 2026)");
  console.log("==========================================================\n");

  let grandTotal = 0;

  for (const r of results) {
    console.log(`${r.clientName} (${r.clientId})`);
    console.log("-".repeat(50));

    if (r.campaigns.length === 0) {
      console.log("  No campaigns in date range.\n");
      continue;
    }

    for (const c of r.campaigns) {
      console.log(`  ${c.name}`);
      console.log(`    Sent: ${c.sent.toLocaleString()}`);
    }

    console.log(`  ${"─".repeat(40)}`);
    console.log(`  Total Sent: ${r.totalSent.toLocaleString()}\n`);
    grandTotal += r.totalSent;
  }

  console.log("==========================================================");
  console.log(`  GRAND TOTAL: ${grandTotal.toLocaleString()} emails sent`);
  console.log("==========================================================");
}

main().catch(console.error);
