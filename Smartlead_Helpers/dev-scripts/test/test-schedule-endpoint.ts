import { getConfig } from "./src/config.js";

async function testScheduleEndpoint() {
  const config = getConfig();
  
  const testCampaignId = 2818171;
  const schedule = {
    timezone: "America/New_York",
    days_of_the_week: [1, 2, 3, 4, 5],
    start_hour: "08:00",
    end_hour: "19:00",
    min_time_btw_emails: 61,
    max_new_leads_per_day: 9500,
  };
  
  // Try different endpoint formats
  const endpoints = [
    `/campaigns/${testCampaignId}/schedule`,
    `/campaigns/${testCampaignId}/scheduler`,
    `/campaigns/${testCampaignId}/settings/schedule`,
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${config.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(schedule),
      });
      
      if (response.ok) {
        console.log(`Success: ${endpoint}`);
        return;
      } else {
        const text = await response.text();
        const preview = text.slice(0, 100);
        console.log(`Failed ${endpoint} (${response.status}): ${preview}...`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`Error ${endpoint}: ${msg}`);
    }
  }
}

testScheduleEndpoint().catch(console.error);
