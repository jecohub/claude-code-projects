import { getConfig } from "../../src/core/config.js";
import { SmartleadClient } from "../../src/core/smartleadClient.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CLIENT_ID = 128520;
const DB_PATH = path.resolve(__dirname, "../../data/lead-ledger.sqlite");

interface PRLead {
  campaign_id: number;
  campaign_name: string;
  company_name: string;
  email: string;
  match_reason: string;
}

interface SmartleadLead {
  id: number;
  email: string;
  lead?: {
    id: number;
    email: string;
  };
}

function getPRLeadsFromDatabase(): PRLead[] {
  const db = new Database(DB_PATH, { readonly: true });

  const query = `
    SELECT DISTINCT
        u.campaign_id,
        u.campaign_name,
        json_extract(l.row_json, '$.Final Company Name') as company_name,
        l.email,
        CASE
            WHEN LOWER(json_extract(l.row_json, '$.Final Description')) LIKE '%public relations%' THEN 'Desc: Public Relations'
            WHEN LOWER(json_extract(l.row_json, '$.Final Description')) LIKE '%reputation management%' THEN 'Desc: Reputation Mgmt'
            WHEN LOWER(json_extract(l.row_json, '$.Final Company Name')) LIKE '%public relations%' THEN 'Name: Public Relations'
            ELSE 'Name: PR (word)'
        END as match_reason
    FROM ledger_upload_leads l
    JOIN ledger_uploads u ON l.upload_id = u.upload_id
    WHERE u.client_id = ?
    AND (
        LOWER(json_extract(l.row_json, '$.Final Description')) LIKE '%public relations%'
        OR LOWER(json_extract(l.row_json, '$.Final Description')) LIKE '%reputation management%'
        OR LOWER(json_extract(l.row_json, '$.Final Company Name')) LIKE '%public relations%'
        OR (
            (UPPER(json_extract(l.row_json, '$.Final Company Name')) = 'PR'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE 'PR %'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE '% PR'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE '% PR %'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE '% PR,%'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE '% PR.%'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE '%(PR)%'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE '%& PR%'
            OR UPPER(json_extract(l.row_json, '$.Final Company Name')) LIKE '%PR &%')
            AND json_extract(l.row_json, '$.Final Company Name') NOT LIKE '%Preschool%'
        )
    )
    ORDER BY u.campaign_id, company_name
  `;

  const rows = db.prepare(query).all(CLIENT_ID) as PRLead[];
  db.close();
  return rows;
}

function groupByCampaign(leads: PRLead[]): Map<number, PRLead[]> {
  const grouped = new Map<number, PRLead[]>();
  for (const lead of leads) {
    const existing = grouped.get(lead.campaign_id) || [];
    existing.push(lead);
    grouped.set(lead.campaign_id, existing);
  }
  return grouped;
}

async function main() {
  const args = process.argv.slice(2);
  const executeMode = args.includes("--execute");

  console.log("\n" + "=".repeat(70));
  console.log(executeMode
    ? "  PR/PUBLIC RELATIONS LEAD DELETION - EXECUTE MODE"
    : "  PR/PUBLIC RELATIONS LEAD DELETION - DRY RUN");
  console.log("=".repeat(70));

  // Step 1: Get PR leads from local database
  console.log("\n[1/4] Fetching PR leads from local database...");
  const prLeads = getPRLeadsFromDatabase();
  console.log(`      Found ${prLeads.length} leads to delete`);

  if (prLeads.length === 0) {
    console.log("\nNo PR leads found. Nothing to delete.");
    return;
  }

  // Step 2: Group by campaign
  const byCampaign = groupByCampaign(prLeads);
  console.log(`      Across ${byCampaign.size} campaigns`);

  // Step 3: Initialize Smartlead client
  console.log("\n[2/4] Initializing Smartlead client...");
  const config = getConfig();
  const client = new SmartleadClient(config);

  // Step 4: For each campaign, fetch leads and match by email to get lead IDs
  console.log("\n[3/4] Matching leads with Smartlead API to get lead IDs...\n");

  interface LeadToDelete {
    campaignId: number;
    campaignName: string;
    leadId: number;
    email: string;
    companyName: string;
    matchReason: string;
  }

  const leadsToDelete: LeadToDelete[] = [];
  const notFoundLeads: PRLead[] = [];

  for (const [campaignId, leads] of byCampaign) {
    const campaignName = leads[0].campaign_name;
    const shortName = campaignName.length > 50
      ? campaignName.substring(0, 47) + "..."
      : campaignName;

    console.log(`Campaign ${campaignId}: ${shortName}`);

    try {
      // Fetch all leads from this campaign
      const smartleadLeads = await client.getCampaignLeads(campaignId) as SmartleadLead[];

      // Create email -> leadId map
      const emailToLeadId = new Map<string, number>();
      for (const sl of smartleadLeads) {
        const lead = sl.lead || sl;
        const email = (lead.email || "").toLowerCase().trim();
        const leadId = lead.id;
        if (email && leadId) {
          emailToLeadId.set(email, leadId);
        }
      }

      // Match our PR leads
      let matchedCount = 0;
      for (const prLead of leads) {
        const email = prLead.email.toLowerCase().trim();
        const leadId = emailToLeadId.get(email);

        if (leadId) {
          leadsToDelete.push({
            campaignId,
            campaignName,
            leadId,
            email: prLead.email,
            companyName: prLead.company_name,
            matchReason: prLead.match_reason,
          });
          matchedCount++;
          console.log(`    - ${prLead.company_name} (${prLead.email}) [lead_id: ${leadId}]`);
        } else {
          notFoundLeads.push(prLead);
          console.log(`    - ${prLead.company_name} (${prLead.email}) [NOT FOUND IN CAMPAIGN]`);
        }
      }

      console.log(`    Subtotal: ${matchedCount}/${leads.length} leads matched\n`);

    } catch (error) {
      console.log(`    ERROR fetching campaign: ${error}`);
      notFoundLeads.push(...leads);
      console.log("");
    }

    // Small delay between campaigns
    await new Promise(r => setTimeout(r, 100));
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total campaigns affected: ${byCampaign.size}`);
  console.log(`Total leads to delete: ${leadsToDelete.length}`);
  console.log(`Leads not found in Smartlead: ${notFoundLeads.length}`);

  if (notFoundLeads.length > 0) {
    console.log("\nLeads not found (may have been deleted or email mismatch):");
    for (const lead of notFoundLeads.slice(0, 10)) {
      console.log(`  - ${lead.company_name} (${lead.email}) [Campaign ${lead.campaign_id}]`);
    }
    if (notFoundLeads.length > 10) {
      console.log(`  ... and ${notFoundLeads.length - 10} more`);
    }
  }

  if (!executeMode) {
    console.log("\n" + "-".repeat(70));
    console.log("  MODE: DRY RUN (no changes made)");
    console.log("-".repeat(70));
    console.log("\nTo execute deletion, run:");
    console.log("  npx tsx dev-scripts/misc/delete-pr-leads.ts --execute\n");
    return;
  }

  // Execute mode - actually delete the leads
  console.log("\n[4/4] Deleting leads from Smartlead...\n");

  let deleted = 0;
  let failed = 0;

  for (const lead of leadsToDelete) {
    try {
      const result = await client.deleteLeadFromCampaign(lead.campaignId, lead.leadId);
      if (result.ok) {
        deleted++;
        console.log(`  [OK] Deleted ${lead.companyName} (${lead.email}) from campaign ${lead.campaignId}`);
      } else {
        failed++;
        console.log(`  [FAIL] Could not delete ${lead.email} - status ${result.status}`);
      }
    } catch (error) {
      failed++;
      console.log(`  [ERROR] ${lead.email}: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("  DELETION COMPLETE");
  console.log("=".repeat(70));
  console.log(`Successfully deleted: ${deleted}`);
  console.log(`Failed: ${failed}`);
  console.log("");
}

main().catch(console.error);
