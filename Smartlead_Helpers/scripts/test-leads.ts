import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = process.env.SMARTLEAD_BASE_URL || "https://server.smartlead.ai/api/v1";
const CAMPAIGN_ID = "2784116"; // One of the SwayyEm campaigns

async function main() {
  console.log(`Testing leads endpoint for campaign ${CAMPAIGN_ID}\n`);

  const url = `${BASE_URL}/campaigns/${CAMPAIGN_ID}/leads?api_key=${API_KEY}`;
  console.log(`URL: ${url}\n`);

  try {
    const response = await fetch(url);
    console.log(`Status: ${response.status}`);

    const text = await response.text();
    console.log(`Response length: ${text.length} chars`);

    const json = JSON.parse(text);
    console.log(`\nResponse structure:`);
    console.log(`Keys:`, Object.keys(json));

    if (json.leads) {
      console.log(`\nLeads array length: ${json.leads.length}`);
      if (json.leads.length > 0) {
        console.log(`\nFirst lead:`, JSON.stringify(json.leads[0], null, 2));
      }
    }

    if (json.data) {
      console.log(`\nData array length: ${json.data.length}`);
      if (json.data.length > 0) {
        console.log(`\nFirst lead:`, JSON.stringify(json.data[0], null, 2));
      }
    }

    console.log(`\nFull response (truncated):`, text.substring(0, 500));
  } catch (err) {
    console.error(`Error:`, err);
  }
}

main().catch(console.error);
