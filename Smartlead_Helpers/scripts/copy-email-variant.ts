import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";

// Configuration
const SOURCE_CAMPAIGN = 2856396;
const TARGET_CAMPAIGN = 2856393;
const SEQ_NUMBER = 2;        // Email 2
const VARIANT_LABEL = "B";   // Copy Variant B

async function copyEmailVariant() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  console.log(`\n=== Copy Email ${SEQ_NUMBER} Variant ${VARIANT_LABEL} ===`);
  console.log(`Source Campaign: ${SOURCE_CAMPAIGN}`);
  console.log(`Target Campaign: ${TARGET_CAMPAIGN}\n`);

  // Step 1: Fetch source sequences
  console.log("1. Fetching source campaign sequences...");
  const sourceSequences = await client.getCampaignSequences(SOURCE_CAMPAIGN);
  console.log(`   Found ${sourceSequences.length} sequences in source campaign`);

  // Step 2: Find Email 2 and Variant B in source
  const sourceEmail = sourceSequences.find((seq: any) => seq.seq_number === SEQ_NUMBER);
  if (!sourceEmail) {
    throw new Error(`Email ${SEQ_NUMBER} not found in source campaign ${SOURCE_CAMPAIGN}`);
  }

  const variants = sourceEmail.sequence_variants || sourceEmail.seq_variants;
  if (!variants || !Array.isArray(variants)) {
    throw new Error(`Email ${SEQ_NUMBER} has no variants in source campaign`);
  }

  const variantB = variants.find((v: any) => v.variant_label === VARIANT_LABEL);
  if (!variantB) {
    throw new Error(`Variant ${VARIANT_LABEL} not found in Email ${SEQ_NUMBER}`);
  }

  console.log(`2. Found Variant ${VARIANT_LABEL}:`);
  console.log(`   Subject: ${variantB.subject}`);
  console.log(`   Body preview: ${variantB.email_body?.substring(0, 100)}...`);

  // Step 3: Fetch target sequences
  console.log("\n3. Fetching target campaign sequences...");
  const targetSequences = await client.getCampaignSequences(TARGET_CAMPAIGN);
  console.log(`   Found ${targetSequences.length} sequences in target campaign`);

  // Step 4: Modify target Email 2
  const targetEmailIndex = targetSequences.findIndex((seq: any) => seq.seq_number === SEQ_NUMBER);
  if (targetEmailIndex === -1) {
    throw new Error(`Email ${SEQ_NUMBER} not found in target campaign ${TARGET_CAMPAIGN}`);
  }

  const targetEmail = targetSequences[targetEmailIndex];
  console.log("\n4. Current target Email 2:");
  console.log(`   Subject: ${targetEmail.subject}`);
  const targetVariants = targetEmail.sequence_variants || targetEmail.seq_variants;
  if (targetVariants && targetVariants.length > 0) {
    console.log(`   Current variants:`);
    targetVariants.forEach((v: any) => {
      const pct = v.variant_distribution_percentage ?? "N/A";
      console.log(`     - ${v.variant_label}: ${pct}% distribution`);
    });
  } else {
    console.log(`   Variants: None (single email)`);
  }

  // Build sanitized sequences for API
  const sanitizedSequences = targetSequences.map((seq: any, index: number) => {
    const sanitized: any = {
      seq_number: seq.seq_number,
      seq_delay_details: {
        delay_in_days: seq.seq_delay_details?.delayInDays || seq.seq_delay_details?.delay_in_days || 1
      },
      subject: seq.subject || "",
      email_body: seq.email_body || "",
    };

    // For Email 2, keep Variant A (0%) and add Variant B (100%)
    if (index === targetEmailIndex) {
      const existingVariants = seq.sequence_variants || seq.seq_variants || [];
      const variantA = existingVariants.find((v: any) => v.variant_label === "A");

      sanitized.seq_variants = [
        // Keep Variant A but turn it off (0%)
        {
          subject: variantA?.subject || seq.subject || "",
          email_body: variantA?.email_body || seq.email_body || "",
          variant_label: "A",
          variant_distribution_percentage: 0,
        },
        // Add Variant B with source content, turned on (100%)
        {
          subject: variantB.subject || "",
          email_body: variantB.email_body || "",
          variant_label: "B",
          variant_distribution_percentage: 100,
        },
      ];
    } else {
      // Keep existing variants for other emails
      const variants = seq.sequence_variants || seq.seq_variants;
      if (variants && Array.isArray(variants) && variants.length > 0) {
        sanitized.seq_variants = variants.map((variant: any) => ({
          subject: variant.subject || "",
          email_body: variant.email_body || "",
          variant_label: variant.variant_label,
          ...(variant.optional_email_body_1 != null && {
            optional_email_body_1: variant.optional_email_body_1
          }),
          ...(variant.variant_distribution_percentage != null && {
            variant_distribution_percentage: variant.variant_distribution_percentage
          }),
        }));
      }
    }

    return sanitized;
  });

  console.log("\n5. Saving modified sequences to target campaign...");
  await client.saveCampaignSequences(TARGET_CAMPAIGN, sanitizedSequences);
  console.log("   Saved successfully!");

  // Step 5: Verify the change
  console.log("\n6. Verifying the change...");
  const verifySequences = await client.getCampaignSequences(TARGET_CAMPAIGN);
  const verifyEmail = verifySequences.find((seq: any) => seq.seq_number === SEQ_NUMBER);

  if (verifyEmail) {
    console.log(`   Email ${SEQ_NUMBER} after update:`);
    console.log(`   Subject: ${verifyEmail.subject}`);
    const verifyVariants = verifyEmail.sequence_variants || verifyEmail.seq_variants;
    if (verifyVariants && verifyVariants.length > 0) {
      console.log(`   Variants:`);
      verifyVariants.forEach((v: any) => {
        const pct = v.variant_distribution_percentage ?? "N/A";
        console.log(`     - ${v.variant_label}: ${pct}% distribution`);
      });
    } else {
      console.log(`   Variants: None (single email)`);
    }
  }

  console.log("\n=== Done! ===\n");
}

copyEmailVariant().catch(console.error);
