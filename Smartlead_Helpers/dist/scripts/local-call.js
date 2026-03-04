import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
dotenv.config();
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required in your environment`);
    }
    return value;
}
const clientIdArg = process.argv[2] ?? process.env.SMARTLEAD_CLIENT_ID;
if (!clientIdArg) {
    throw new Error("Provide the Smartlead client ID as the first argument or SMARTLEAD_CLIENT_ID env var.");
}
const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "dev"],
    env: {
        SMARTLEAD_API_KEY: requireEnv("SMARTLEAD_API_KEY"),
        ...(process.env.SMARTLEAD_BASE_URL ? { SMARTLEAD_BASE_URL: process.env.SMARTLEAD_BASE_URL } : {}),
    },
    stderr: "inherit",
});
const client = new Client({ name: "smartlead-local-client", version: "0.1.0" });
async function run() {
    await client.connect(transport);
    try {
        console.log("\n=== Testing getCampaignReport (from Dec 17, 2025) ===");
        const reportResult = await client.callTool({
            name: "getCampaignReport",
            arguments: {
                clientId: clientIdArg,
                fromDate: "2025-12-17T00:00:00Z",
            },
        });
        // Pretty print the text content
        if (reportResult.content && Array.isArray(reportResult.content) && reportResult.content.length > 0) {
            const firstContent = reportResult.content[0];
            if (firstContent && firstContent.text) {
                console.log(firstContent.text);
            }
            else {
                console.log(JSON.stringify(reportResult, null, 2));
            }
        }
        else {
            console.log(JSON.stringify(reportResult, null, 2));
        }
    }
    finally {
        await client.close();
    }
}
run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
