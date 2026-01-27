import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { parseCSV } from "./src/csvProcessor.js";
import { loadClientMapping } from "./src/utils/mappingStorage.js";
import { Lead } from "./src/types.js";

const CSV_PATH = "/Users/jericodelacruz/Desktop/C17/Swayyem/Campaign/2026 Jan 20/to launch/Contacts-or-USandUK-or-Tech-2-2026-Final-View-export-1768907663439.csv";
const TARGET_CAMPAIGN_ID = 2856396; // Catchall 1
const CLIENT_ID = "128520";

// Catchall = Bounceban verified, Valid = Million Verifier
function isCatchall(provider: string): boolean {
  const lowerProvider = provider?.toLowerCase() || "";
  return lowerProvider.includes("bounceban");
}

function isOutlook(emailHost: string): boolean {
  const lowerHost = emailHost?.toLowerCase() || "";
  return lowerHost.includes("microsoft") || lowerHost.includes("outlook") || lowerHost.includes("office365");
}

async function fix() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  console.log("=== FIX CATCHALL LEADS ===\n");

  // Load CSV and mappings
  const rows = await parseCSV(CSV_PATH);
  const mappings = await loadClientMapping(CLIENT_ID);

  if (!mappings) {
    console.error("No mappings found for client");
    return;
  }

  // Count all catchall non-outlook in CSV first
  let totalCatchallInCSV = 0;
  for (const row of rows) {
    const provider = row["Final Provider"] || "";
    const emailHost = row["Email Host"] || "";
    if (!isOutlook(emailHost) && isCatchall(provider)) {
      totalCatchallInCSV++;
    }
  }
  console.log(`Total catchall non-outlook in CSV: ${totalCatchallInCSV}`);

  // Get existing emails in Catchall 1
  console.log("Fetching existing leads from Catchall 1...");
  const existingLeads = await client.getCampaignLeads(TARGET_CAMPAIGN_ID);
  const existingEmails = new Set(
    existingLeads.map((item: any) => (item.lead?.email || item.email)?.toLowerCase()).filter(Boolean)
  );
  console.log(`Found ${existingEmails.size} existing emails\n`);

  // Find catchall non-outlook leads from CSV that aren't in the campaign
  console.log("Processing CSV for missing catchall leads...");
  const missingLeads: Lead[] = [];

  for (const row of rows) {
    const provider = row["Final Provider"] || "";
    const emailHost = row["Email Host"] || "";
    const email = row["Final Email"]?.toLowerCase();

    // Check if non-outlook catchall
    if (!isOutlook(emailHost) && isCatchall(provider)) {
      // Check if not already in campaign
      if (email && !existingEmails.has(email)) {
        // Build lead object using mappings
        const lead: Lead = { email: row["Final Email"] };

        for (const mapping of mappings) {
          const value = row[mapping.csvColumn];
          if (!value) continue;

          if (mapping.smartleadField === "custom") {
            if (!lead.custom_fields) lead.custom_fields = {};
            lead.custom_fields[mapping.customFieldName || mapping.csvColumn] = value;
          } else if (mapping.smartleadField !== "email") {
            (lead as any)[mapping.smartleadField] = value;
          }
        }

        missingLeads.push(lead);
      }
    }
  }

  console.log(`Found ${missingLeads.length} missing catchall leads\n`);

  if (missingLeads.length === 0) {
    console.log("No missing leads to upload.");
    return;
  }

  // Show sample
  console.log("Sample of missing leads:");
  for (const lead of missingLeads.slice(0, 5)) {
    console.log(`  - ${lead.email}`);
  }
  console.log();

  // Upload with ignoreGlobalBlockList
  console.log("Uploading with ignoreGlobalBlockList: true...\n");
  const result = await client.addLeadsToCampaign(TARGET_CAMPAIGN_ID, missingLeads, {
    ignoreGlobalBlockList: true,
    ignoreDuplicateLeadsInOtherCampaign: true,
  });

  console.log(`\n=== RESULT ===`);
  console.log(`Uploaded: ${result.upload_count}`);
  console.log(`Failed: ${result.failed_count}`);
}

fix().catch(console.error);
