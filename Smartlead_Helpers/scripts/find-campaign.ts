import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = process.env.SMARTLEAD_BASE_URL || "https://server.smartlead.ai/api/v1";
const SEARCH_ID = process.argv[2] || "13039773";

async function main() {
  console.log(`Searching for campaigns related to ID: ${SEARCH_ID}\n`);

  const response = await fetch(`${BASE_URL}/campaigns?api_key=${API_KEY}`);
  const campaigns = await response.json();

  console.log(`Total campaigns in account: ${campaigns.length}\n`);

  // Search for campaigns that match this ID in any field
  const matches = campaigns.filter((c: any) => {
    const json = JSON.stringify(c);
    return json.includes(SEARCH_ID);
  });

  if (matches.length > 0) {
    console.log(`Found ${matches.length} campaigns matching ID ${SEARCH_ID}:\n`);
    matches.forEach((c: any) => {
      console.log(`Campaign ID: ${c.id}`);
      console.log(`Name: ${c.name}`);
      console.log(`Client ID: ${c.client_id}`);
      console.log(`Status: ${c.status}`);
      console.log(`---`);
    });
  } else {
    console.log(`No campaigns found matching ID ${SEARCH_ID}`);
    console.log(`\nLet's check what client_ids exist:`);
    const clientIds = new Set(campaigns.map((c: any) => c.client_id).filter(Boolean));
    console.log(`Unique client IDs:`, Array.from(clientIds).sort());
  }
}

main().catch(console.error);
