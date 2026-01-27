import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { Lead } from "./src/types.js";

// Source campaign deleted - using CSV directly now
const TARGET_CAMPAIGN_ID = 2856396; // Non-Outlook Catchall 1

async function transferLeads() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  console.log("=== LEAD TRANSFER ===\n");
  console.log(`Source: Campaign ${SOURCE_CAMPAIGN_ID}`);
  console.log(`Target: Campaign ${TARGET_CAMPAIGN_ID}\n`);

  // Step 1: Fetch leads from source campaign
  console.log("Step 1: Fetching leads from source campaign...");
  const sourceLeads = await client.getCampaignLeads(SOURCE_CAMPAIGN_ID);
  console.log(`  Found ${sourceLeads.length} leads\n`);

  if (sourceLeads.length === 0) {
    console.log("No leads to transfer. Exiting.");
    return;
  }

  // Step 2: Transform leads to upload format
  console.log("Step 2: Transforming leads for upload...");
  const leadsToUpload: Lead[] = sourceLeads.map((item: any) => {
    const lead = item.lead || item;

    // Build lead object with standard fields
    const uploadLead: Lead = {
      email: lead.email,
      first_name: lead.first_name,
      last_name: lead.last_name,
      company_name: lead.company_name,
      phone_number: lead.phone_number,
      website: lead.website,
      location: lead.location,
      linkedin_profile: lead.linkedin_profile,
      company_url: lead.company_url,
    };

    // Add custom fields if present
    if (lead.custom_fields && typeof lead.custom_fields === "object") {
      uploadLead.custom_fields = lead.custom_fields;
    }

    return uploadLead;
  });
  console.log(`  Prepared ${leadsToUpload.length} leads for upload\n`);

  // Step 3: Upload to target campaign
  console.log("Step 3: Uploading leads to target campaign...");
  const result = await client.addLeadsToCampaign(TARGET_CAMPAIGN_ID, leadsToUpload, {
    ignoreDuplicateLeadsInOtherCampaign: true,
  });
  console.log(`  Uploaded: ${result.upload_count} leads`);
  console.log(`  Failed: ${result.failed_count} leads\n`);

  // Step 4: Delete source campaign
  console.log("Step 4: Deleting source campaign...");
  const deleteResponse = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SOURCE_CAMPAIGN_ID}?api_key=${config.apiKey}`,
    { method: "DELETE" }
  );

  if (deleteResponse.ok) {
    console.log(`  ✓ Campaign ${SOURCE_CAMPAIGN_ID} deleted\n`);
  } else {
    console.log(`  ✗ Failed to delete campaign: ${deleteResponse.status}\n`);
  }

  // Summary
  console.log("=== TRANSFER COMPLETE ===");
  console.log(`Leads transferred: ${result.upload_count}`);
  console.log(`Target campaign: https://app.smartlead.ai/app/email-campaign/${TARGET_CAMPAIGN_ID}/analytics`);
}

transferLeads().catch((error) => {
  console.error("Transfer failed:", error);
  process.exit(1);
});
