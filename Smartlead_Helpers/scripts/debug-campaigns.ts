import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = process.env.SMARTLEAD_BASE_URL || "https://server.smartlead.ai/api/v1";
const CLIENT_ID = "128520";

async function main() {
  console.log(`Testing campaigns endpoint for client ${CLIENT_ID}\n`);

  const url = `${BASE_URL}/campaigns?api_key=${API_KEY}&client_id=${CLIENT_ID}`;
  console.log(`URL: ${url}\n`);

  const response = await fetch(url);
  console.log(`Status: ${response.status}`);

  const text = await response.text();
  console.log(`Response length: ${text.length} chars\n`);

  const json = JSON.parse(text);
  console.log(`Response type: ${Array.isArray(json) ? 'Array' : 'Object'}`);

  if (Array.isArray(json)) {
    console.log(`Array length: ${json.length}`);
    if (json.length > 0) {
      console.log(`\nFirst campaign:`, JSON.stringify(json[0], null, 2));
    }
  } else {
    console.log(`Object keys:`, Object.keys(json));
    console.log(`\nFull response:`, JSON.stringify(json, null, 2).substring(0, 500));
  }
}

main().catch(console.error);
