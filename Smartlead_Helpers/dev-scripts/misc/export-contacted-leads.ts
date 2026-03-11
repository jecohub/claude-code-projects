/**
 * Export all "contacted" leads (INPROGRESS + BLOCKED) for Recho (client 146909)
 * from campaigns created after February 24, 2026.
 *
 * Usage: npx tsx dev-scripts/misc/export-contacted-leads.ts
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
const CONTACTED_STATUSES = new Set(["INPROGRESS", "BLOCKED"]);

function flattenLead(item: any): Record<string, string> {
  const { lead, ...topLevel } = item;
  const flat: Record<string, string> = {};

  for (const [key, value] of Object.entries(topLevel)) {
    flat[key] = value === null || value === undefined ? "" : String(value);
  }

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

  const headerSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }

  const priorityHeaders = ["campaign_id", "campaign_name", "status"];
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
  console.log("  EXPORT: Contacted Leads (INPROGRESS + BLOCKED)");
  console.log("  Client: Recho (146909)");
  console.log("  Campaigns created after: 2026-02-24");
  console.log("=".repeat(60));

  console.log("\n[1/3] Fetching campaigns...");
  const { items: allCampaigns } = await client.listCampaigns(CLIENT_ID, {
    pageSize: 1000,
  });

  const campaigns = allCampaigns.filter((c: any) => {
    return new Date(c.created_at) > AFTER_DATE;
  });

  console.log(
    `      ${campaigns.length} campaign(s) found (out of ${allCampaigns.length} total)`,
  );

  if (campaigns.length === 0) {
    console.log("\nNo campaigns found after the cutoff date. Nothing to export.");
    return;
  }

  console.log("\n[2/3] Fetching contacted leads (INPROGRESS + BLOCKED)...\n");

  const matchedRows: Record<string, string>[] = [];
  let inprogressTotal = 0;
  let blockedTotal = 0;

  for (const campaign of campaigns as any[]) {
    const campaignId = campaign.id;
    const campaignName = campaign.name;

    process.stdout.write(`      Campaign [${campaignId}] ${campaignName} ... `);

    try {
      const leads = await client.getCampaignLeads(campaignId);

      const contacted = leads.filter((l: any) => CONTACTED_STATUSES.has(l.status));
      const inprogress = contacted.filter((l: any) => l.status === "INPROGRESS").length;
      const blocked = contacted.filter((l: any) => l.status === "BLOCKED").length;

      console.log(
        `${contacted.length} / ${leads.length} leads match (${inprogress} INPROGRESS, ${blocked} BLOCKED)`,
      );

      inprogressTotal += inprogress;
      blockedTotal += blocked;

      for (const lead of contacted) {
        const flat = flattenLead(lead);
        flat["campaign_id"] = String(campaignId);
        flat["campaign_name"] = campaignName;
        matchedRows.push(flat);
      }
    } catch (err) {
      console.log(`ERROR: ${err}`);
    }
  }

  console.log(`\n[3/3] Writing CSV...`);

  const today = new Date().toISOString().slice(0, 10);
  const reportsDir = join(__dirname, "../../reports");
  mkdirSync(reportsDir, { recursive: true });

  const outputPath = join(reportsDir, `recho-contacted-${today}.csv`);
  writeCsv(matchedRows, outputPath);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  DONE`);
  console.log(`  INPROGRESS: ${inprogressTotal.toLocaleString()}`);
  console.log(`  BLOCKED:    ${blockedTotal.toLocaleString()}`);
  console.log(`  Total exported: ${matchedRows.length.toLocaleString()}`);
  console.log(`  Output: reports/recho-contacted-${today}.csv`);
  console.log("=".repeat(60));
}

main().catch(console.error);
