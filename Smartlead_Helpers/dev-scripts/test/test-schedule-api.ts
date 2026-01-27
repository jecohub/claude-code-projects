import { getConfig } from "./src/config.js";
import { SmartleadClient } from "./src/smartleadClient.js";

async function testScheduleEndpoints() {
  const config = getConfig();
  const client = new SmartleadClient(config);

  // Use the campaign we just created for testing
  const testCampaignId = 2818321;

  const schedule = {
    timezone: "America/New_York",
    days_of_the_week: [1, 2, 3, 4, 5],
    start_hour: "09:00",
    end_hour: "17:00",
    min_time_btw_emails: 61,
    max_new_leads_per_day: 100,
  };

  console.log(`\n=== Testing Schedule API Endpoints ===\n`);

  // Test different endpoint paths
  const endpoints = [
    `/campaigns/${testCampaignId}/schedule`,
    `/campaigns/${testCampaignId}/scheduler`,
    `/campaigns/${testCampaignId}/settings/schedule`,
    `/campaigns/${testCampaignId}`, // Current endpoint
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      await (client as any).postJson(endpoint, schedule);
      console.log(`✅ SUCCESS! Correct endpoint: ${endpoint}\n`);
      return endpoint;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const preview = msg.slice(0, 150);
      console.log(`❌ Failed: ${preview}...\n`);
    }
  }

  console.log(`❌ None of the tested endpoints worked for schedule updates\n`);
}

testScheduleEndpoints().catch(console.error);
