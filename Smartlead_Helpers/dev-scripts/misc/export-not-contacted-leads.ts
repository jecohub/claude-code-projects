/**
 * Export all "Not contacted yet" leads for Recho (client 146909)
 * from campaigns created after February 24, 2026.
 *
 * Usage: npx tsx dev-scripts/misc/export-not-contacted-leads.ts
 */

import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLIENT_ID = "146909";
const AFTER_DATE = new Date("2026-02-24T00:00:00.000Z");
// Smartlead API returns "STARTED" for leads that haven't been contacted yet
const LEAD_STATUS = "STARTED";

function flattenObject(obj: any, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      flat[fullKey] = "";
    } else if (Array.isArray(value)) {
      flat[fullKey] = JSON.stringify(value);
    } else if (typeof value === "object") {
      // Recurse one level deep
      for (const [nestedKey, nestedValue] of Object.entries(value as object)) {
        const nestedFullKey = `${fullKey}.${nestedKey}`;
        if (nestedValue === null || nestedValue === undefined) {
          flat[nestedFullKey] = "";
        } else if (typeof nestedValue === "object") {
          flat[nestedFullKey] = JSON.stringify(nestedValue);
        } else {
          flat[nestedFullKey] = String(nestedValue);
        }
      }
    } else {
      flat[fullKey] = String(value);
    }
  }

  return flat;
}

function flattenLead(item: any): Record<string, string> {
  // Top-level fields (campaign_lead_map_id, status, created_at, etc.)
  const { lead, ...topLevel } = item;

  const flat: Record<string, string> = {};

  // Top-level fields first
  for (const [key, value] of Object.entries(topLevel)) {
    flat[key] = value === null || value === undefined ? "" : String(value);
  }

  // Nested lead fields (id, first_name, custom_fields, etc.)
  if (lead && typeof lead === "object") {
    const { custom_fields, ...leadFields } = lead;

    for (const [key, value] of Object.entries(leadFields)) {
      if (value === null || value === undefined) {
        flat[key] = "";
      } else if (typeof value === "object") {
        flat[key] = JSON.stringify(value);
      } else {
        flat[key] = String(value);
      }
    }

    // Flatten custom_fields as top-level columns
    if (custom_fields && typeof custom_fields === "object") {
      for (const [cfKey, cfValue] of Object.entries(custom_fields)) {
        flat[cfKey] = cfValue === null || cfValue === undefined ? "" : String(cfValue);
      }
    }
  }

  return flat;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function writeCsv(rows: Record<string, string>[], outputPath: string): void {
  if (rows.length === 0) {
    writeFileSync(outputPath, "");
    return;
  }

  // Collect all unique headers across all rows
  const headerSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }

  // Put campaign_id and campaign_name first, then sort the rest
  const priorityHeaders = ["campaign_id", "campaign_name"];
  const otherHeaders = [...headerSet]
    .filter((h) => !priorityHeaders.includes(h))
    .sort();
  const headers = [
    ...priorityHeaders.filter((h) => headerSet.has(h)),
    ...otherHeaders,
  ];

  const lines: string[] = [];
  lines.push(headers.map(escapeCsvField).join(","));

  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h] ?? "")).join(","));
  }

  writeFileSync(outputPath, lines.join("\n") + "\n", "utf-8");
}

async function main() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  console.log("=".repeat(60));
  console.log("  EXPORT: Not Contacted Yet (STARTED) Leads — Recho (146909)");
  console.log("  Campaigns created after: 2026-02-24");
  console.log("=".repeat(60));

  // Step 1: List all campaigns for this client
  console.log("\n[1/3] Fetching campaigns...");
  const { items: allCampaigns } = await client.listCampaigns(CLIENT_ID, {
    pageSize: 1000,
  });

  const campaigns = allCampaigns.filter((c: any) => {
    const createdAt = new Date(c.created_at);
    return createdAt > AFTER_DATE;
  });

  console.log(
    `      ${campaigns.length} campaign(s) found (out of ${allCampaigns.length} total)`,
  );

  if (campaigns.length === 0) {
    console.log("\nNo campaigns found after the cutoff date. Nothing to export.");
    return;
  }

  for (const c of campaigns as any[]) {
    console.log(`      - [${c.id}] ${c.name} (created: ${c.created_at?.slice(0, 10)})`);
  }

  // Step 2: Fetch leads for each campaign and filter by status
  console.log(`\n[2/3] Fetching leads with status "${LEAD_STATUS}"...\n`);

  const matchedRows: Record<string, string>[] = [];

  for (const campaign of campaigns as any[]) {
    const campaignId = campaign.id;
    const campaignName = campaign.name;

    process.stdout.write(`      Campaign [${campaignId}] ${campaignName} ... `);

    try {
      const leads = await client.getCampaignLeads(campaignId);

      const notContacted = leads.filter(
        (l: any) => l.status === LEAD_STATUS,
      );

      console.log(`${notContacted.length} / ${leads.length} leads match`);

      for (const lead of notContacted) {
        const flat = flattenLead(lead);
        flat["campaign_id"] = String(campaignId);
        flat["campaign_name"] = campaignName;
        matchedRows.push(flat);
      }
    } catch (err) {
      console.log(`ERROR: ${err}`);
    }
  }

  // Step 3: Write CSV
  console.log(`\n[3/3] Writing CSV...`);

  const today = new Date().toISOString().slice(0, 10);
  const reportsDir = join(__dirname, "../../reports");
  mkdirSync(reportsDir, { recursive: true });

  const outputPath = join(reportsDir, `recho-not-contacted-${today}.csv`);
  writeCsv(matchedRows, outputPath);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  DONE`);
  console.log(`  Total leads exported: ${matchedRows.length}`);
  console.log(`  Output: reports/recho-not-contacted-${today}.csv`);
  console.log("=".repeat(60));
}

main().catch(console.error);
