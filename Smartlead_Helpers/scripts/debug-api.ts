import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = process.env.SMARTLEAD_BASE_URL || "https://server.smartlead.ai/api/v1";
const CLIENT_ID = process.argv[2] || process.env.SMARTLEAD_CLIENT_ID || "12659923";

async function testEndpoint(name: string, url: string) {
  console.log(`\n=== Testing ${name} ===`);
  console.log(`URL: ${url}`);

  try {
    const response = await fetch(url);
    console.log(`Status: ${response.status}`);

    const text = await response.text();
    console.log(`Response length: ${text.length} chars`);

    try {
      const json = JSON.parse(text);
      console.log(`Parsed JSON:`, JSON.stringify(json, null, 2));
    } catch {
      console.log(`Raw response:`, text.substring(0, 500));
    }
  } catch (err) {
    console.error(`Error:`, err);
  }
}

async function main() {
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`API Key: ${API_KEY?.substring(0, 20)}...`);

  // Test campaigns endpoint
  await testEndpoint(
    "Campaigns (no filters)",
    `${BASE_URL}/campaigns?api_key=${API_KEY}`
  );

  await testEndpoint(
    "Campaigns (with client_id)",
    `${BASE_URL}/campaigns?api_key=${API_KEY}&client_id=${CLIENT_ID}`
  );

  // Test a single campaign's leads if we find any
  console.log("\nDone!");
}

main().catch(console.error);
