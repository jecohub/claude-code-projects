#!/usr/bin/env npx tsx
/**
 * Client Health Overview
 *
 * Displays campaign health for 5 key clients at a glance.
 *
 * Usage:
 *   npx tsx scripts/client-health.ts
 *   npx tsx scripts/client-health.ts --from=2025-01-01
 */

import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";
import {
  calculateCampaignHealth,
  formatHealthSection,
} from "../src/features/client-health/campaignHealthService.js";

// Hardcoded key clients
const KEY_CLIENTS = [
  { id: "13264", name: "FilterKing" },
  { id: "127608", name: "Iconic" },
  { id: "128520", name: "SwayyEm" },
  { id: "77930", name: "Sohva Social" },
  { id: "146909", name: "Recho" },
];

interface CliArgs {
  fromDate?: Date;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  const fromDateStr = args
    .find((a) => a.startsWith("--from="))
    ?.split("=")[1];

  const fromDate = fromDateStr ? new Date(fromDateStr) : undefined;

  return { fromDate };
}

function showUsage() {
  console.log(`
Client Health Overview - Quick glance at key client campaign health

Usage:
  npx tsx scripts/client-health.ts [options]

Options:
  --from=<DATE>    Filter campaigns from this date onwards (YYYY-MM-DD format)
                   Example: --from=2025-01-01

Key Clients:
${KEY_CLIENTS.map(c => `  - ${c.name} (${c.id})`).join('\n')}

Examples:
  # View health for all key clients
  npx tsx scripts/client-health.ts

  # View health from a specific date
  npx tsx scripts/client-health.ts --from=2025-01-01
  `);
}

async function main() {
  const args = parseArgs();

  // Check for help flag
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showUsage();
    process.exit(0);
  }

  try {
    const config = getConfig();
    const client = new SmartleadClient(config);

    console.log("================================================================================");
    console.log("                        KEY CLIENTS CAMPAIGN HEALTH");
    console.log("================================================================================");
    if (args.fromDate) {
      console.log(`Date Filter: From ${args.fromDate.toISOString().split('T')[0]} onwards`);
    }
    console.log(`Generated: ${new Date().toLocaleString()}`);

    for (const keyClient of KEY_CLIENTS) {
      try {
        const report = await client.getCampaignReport(keyClient.id, args.fromDate);
        const health = await calculateCampaignHealth(client, report);
        const healthSection = formatHealthSection(health, keyClient.name, keyClient.id);
        console.log(healthSection);
      } catch (error) {
        console.log("");
        console.log("================================================================================");
        console.log(`📊 ${keyClient.name.toUpperCase()} (${keyClient.id}) CAMPAIGN HEALTH`);
        console.log("================================================================================");
        console.log("");
        console.log(`Status:         ⚠️ Error`);
        console.log(`Message:        Failed to fetch data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log("");
        console.log("================================================================================");
      }
    }

    console.log("");
    console.log("Report complete.");

  } catch (error) {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
