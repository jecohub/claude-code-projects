import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";
import { BulkUploadService } from "./src/bulkUploadService.js";

const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";
const sourceCampaignId = 2818135;
const clientId = "77930";

async function testUiSettings() {
  console.log("=== UI-ONLY SETTINGS TEST ===\n");
  console.log(`CSV File: ${csvFilePath}`);
  console.log(`Source Campaign ID: ${sourceCampaignId}`);
  console.log(`Client ID: ${clientId}\n`);

  const config = getConfig();
  const client = new SmartleadClient(config);
  const service = new BulkUploadService(client);

  console.log("📋 EXPECTED BEHAVIOR:");
  console.log("  ✓ AI Categorization: Applied from config (10 categories)");
  console.log("  ✓ Bounce Protection: Applied from config (4% threshold)");
  console.log("  ✓ OOO Detection: Copied from source campaign");
  console.log("  ✓ Sequences: Copied from source campaign");
  console.log("  ✓ Schedule: Copied from source campaign\n");

  // Step 1: Duplicate campaign to test UI-only settings
  console.log("🔄 Step 1: Duplicating campaign with UI-only settings...\n");

  const duplicateResult = await client.duplicateCampaign(
    sourceCampaignId,
    "TEST - UI Settings (AI/Bounce Fixed + OOO Copied)",
    clientId,
    {
      throwOnError: false,
      verifyAfterCopy: true,
      verbose: true,
      retryAttempts: 2,
    }
  );

  console.log(`\n=== DUPLICATION RESULT ===`);
  console.log(`Success: ${duplicateResult.success ? "✅" : "❌"}`);
  console.log(`New Campaign ID: ${duplicateResult.campaignId}`);
  console.log(`Campaign Name: ${duplicateResult.campaignName}`);

  console.log(`\n📊 What was copied:`);
  console.log(`  Settings: ${duplicateResult.copied.settings ? "✅" : "❌"}`);
  console.log(`  UI-Only Settings: ${duplicateResult.copied.uiOnlySettings ? "✅" : "❌"}`);
  console.log(`  Schedule: ${duplicateResult.copied.schedule ? "✅" : "❌"}`);
  console.log(`  Sequences: ${duplicateResult.copied.sequences ? "✅" : "❌"} (${duplicateResult.copied.sequenceCount || 0} sequences)`);

  if (duplicateResult.warnings.length > 0) {
    console.log(`\n⚠️  Warnings:`);
    duplicateResult.warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (duplicateResult.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    duplicateResult.errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log(`\n📝 Steps executed:`);
  duplicateResult.steps.forEach(step => {
    const icon = step.status === 'success' ? '✅' :
                 step.status === 'failed' ? '❌' :
                 step.status === 'partial' ? '⚠️' : '⏭️';
    console.log(`  ${icon} ${step.name}: ${step.message || step.error || step.status}`);
  });

  if (!duplicateResult.success) {
    console.log("\n❌ Campaign duplication failed. Stopping test.");
    return;
  }

  // Step 2: Upload leads to the new campaign
  console.log("\n\n🔄 Step 2: Uploading 3.2k leads to the new campaign...\n");

  const uploadResult = await service.execute({
    csvFilePath,
    sourceCampaignId: duplicateResult.campaignId, // Upload to the NEW campaign
    clientId,
    ignoreGlobalBlockList: false,
    isNewCampaign: true, // This is a brand new campaign
  });

  console.log("\n=== UPLOAD RESULT ===");
  console.log(`Status: ${uploadResult.success ? "✅ SUCCESS" : "❌ FAILED"}`);
  console.log(`\n📊 SUMMARY:`);
  console.log(`  Total Splits: ${uploadResult.totalSplits}`);
  console.log(`  Campaigns Created: ${uploadResult.summary.campaignsCreated}`);
  console.log(`  Leads Processed: ${uploadResult.summary.totalLeadsProcessed.toLocaleString()}`);
  console.log(`  Leads Uploaded: ${uploadResult.summary.totalLeadsUploaded.toLocaleString()}`);
  console.log(`  Leads Failed: ${uploadResult.summary.totalLeadsFailed.toLocaleString()}`);

  if (uploadResult.campaignResults.length > 0) {
    console.log(`\n📋 CAMPAIGN DETAILS:`);
    for (const campaign of uploadResult.campaignResults) {
      const status = campaign.uploadedLeads > 0 ? "✓" : "✗";
      console.log(`\n  ${status} ${campaign.campaignName} (ID: ${campaign.campaignId})`);
      console.log(`     Group: ${campaign.groupType} | Split: ${campaign.splitNumber}`);
      console.log(`     Uploaded: ${campaign.uploadedLeads}/${campaign.totalLeads} leads`);

      if (campaign.errors.length > 0) {
        console.log(`     Errors: ${campaign.errors.join(", ")}`);
      }
    }
  }

  if (uploadResult.errors.length > 0) {
    console.log(`\n⚠️  ERRORS:`);
    uploadResult.errors.forEach((error) => {
      console.log(`  - ${error}`);
    });
  }

  // Step 3: Verification reminder
  console.log("\n\n=== MANUAL VERIFICATION NEEDED ===");
  console.log(`\nPlease verify in Smartlead UI (Campaign ID: ${duplicateResult.campaignId}):`);
  console.log(`\n1. AI Categorization:`);
  console.log(`   - Should have 10 categories (Do Not Contact, Information Request, etc.)`);
  console.log(`   - "Intelli-categorise replies using Smartlead's AI" should be ENABLED`);
  console.log(`\n2. Bounce Protection:`);
  console.log(`   - "Activate auto-pause protection from bounces" should be ENABLED`);
  console.log(`   - Threshold should be set to 4%`);
  console.log(`\n3. Out of Office Detection:`);
  console.log(`   - Should match source campaign (ID: ${sourceCampaignId})`);
  console.log(`   - Checkboxes should be same as source`);
  console.log(`\n4. Sequences & Schedule:`);
  console.log(`   - Should match source campaign`);

  console.log(`\n✅ Test complete! Check campaign ${duplicateResult.campaignId} in Smartlead UI.`);
}

testUiSettings().catch((error) => {
  console.error("\n❌ Test failed:");
  console.error(error);
  process.exit(1);
});
