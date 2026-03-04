import { getConfig } from "../src/core/config.js";
async function main() {
    const config = getConfig();
    // Fetch all campaigns
    const response = await fetch(`${config.baseUrl}/campaigns?api_key=${config.apiKey}`);
    const campaigns = await response.json();
    // Group campaigns by client_id and extract client name from campaign names
    const clientMap = new Map();
    campaigns.forEach((campaign) => {
        const clientId = campaign.client_id;
        if (clientId !== null && clientId !== undefined) {
            if (!clientMap.has(clientId)) {
                // Try to extract client name from campaign name
                const campaignName = campaign.name || "";
                // Common patterns: 'ClientName | ...' or 'ClientName - ...'
                let clientName = campaignName.split(/[|\-]/)[0]?.trim() || `Client_${clientId}`;
                clientMap.set(clientId, {
                    clientId,
                    clientName,
                    campaignCount: 1,
                });
            }
            else {
                clientMap.get(clientId).campaignCount++;
            }
        }
    });
    // Sort by client ID
    const clients = Array.from(clientMap.values()).sort((a, b) => a.clientId - b.clientId);
    console.log("Client ID | Client Name");
    console.log("----------|------------");
    clients.forEach((client) => {
        console.log(`${client.clientId} | ${client.clientName}`);
    });
    console.log(`\nTotal clients: ${clients.length}`);
}
main().catch(console.error);
