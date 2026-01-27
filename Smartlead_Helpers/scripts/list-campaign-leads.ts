import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";

const testCampaignId = 2816471;

async function listCampaignLeads() {
  console.log("=== LIST CAMPAIGN LEADS ===\n");

  const config = getConfig();
  const client = new SmartleadClient(config);

  try {
    // Try to get leads list
    const leads = await (client as any).getJson(
      `/campaigns/${testCampaignId}/leads`,
      new URLSearchParams({ limit: "10", offset: "0" })
    );

    console.log("Leads response:");
    console.log(JSON.stringify(leads, null, 2));
  } catch (error: any) {
    console.log("❌ Error fetching leads:");
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

listCampaignLeads().catch(console.error);
