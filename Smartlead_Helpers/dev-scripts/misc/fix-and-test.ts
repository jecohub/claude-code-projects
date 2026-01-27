import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function quickTest() {
  console.log("Testing enhanced duplication with fixes...\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  // Test duplication directly with verbose mode
  const result = await client.duplicateCampaign(
    2818135, // source campaign
    "Test Duplication - DELETE ME",
    "77930",
    {
      throwOnError: false,
      verifyAfterCopy: true,
      verbose: true,
      retryAttempts: 2,
      skipSchedule: false, // TEST SCHEDULE NOW
      skipSequences: false, // TEST SEQUENCES
    }
  );

  console.log("\n=== DUPLICATION RESULT ===");
  console.log("Success:", result.success);
  console.log("Campaign ID:", result.campaignId);
  console.log("\nCopied:");
  console.log("  Settings:", result.copied.settings);
  console.log("  Schedule:", result.copied.schedule);
  console.log("  Sequences:", result.copied.sequences);

  console.log("\nWarnings:", result.warnings);
  console.log("\nErrors:", result.errors);

  console.log("\nSteps:");
  result.steps.forEach(step => {
    const icon = step.status === 'success' ? '✓' : step.status === 'failed' ? '✗' : '-';
    const msg = step.message ? ` (${step.message})` : '';
    console.log(`  ${icon} ${step.name}: ${step.status}${msg}`);
    if (step.error) console.log(`     Error: ${step.error}`);
  });
}

quickTest().catch(console.error);
