import { getConfig } from "../../src/core/config.js";

const config = getConfig();

const res = await fetch(
  `https://server.smartlead.ai/api/v1/campaigns/2992318/leads?api_key=${config.apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_list: [{
        first_name: "Test",
        last_name: "User",
        email: "test@test.com",
        company_name: "Test Co",
      }],
      settings: { ignore_global_block_list: false },
    }),
  },
);

const text = await res.text();
console.log("Status:", res.status);
console.log("Response:", text);
