import fs from "node:fs";
import { parseCSV } from "../src/features/bulk-upload/csvProcessor.js";
import { LeadLedger } from "../src/features/lead-ledger/leadLedger.js";
import { mapCSVRowToLead } from "../src/features/bulk-upload/utils/fieldMapper.js";
function parseArgs() {
    const args = process.argv.slice(2);
    const clientIdStr = args
        .find((a) => a.startsWith("--clientId="))
        ?.split("=")[1];
    const clientName = args
        .find((a) => a.startsWith("--clientName="))
        ?.split("=")
        .slice(1)
        .join("="); // allow '=' in names
    const campaignIdStr = args
        .find((a) => a.startsWith("--campaignId="))
        ?.split("=")[1];
    const campaignName = args
        .find((a) => a.startsWith("--campaignName="))
        ?.split("=")
        .slice(1)
        .join("="); // allow '=' in names
    const csvFilePath = args
        .find((a) => a.startsWith("--csv="))
        ?.split("=")
        .slice(1)
        .join("=");
    const uploadedAt = args
        .find((a) => a.startsWith("--uploadedAt="))
        ?.split("=")[1];
    return {
        clientId: clientIdStr ? Number(clientIdStr) : undefined,
        clientName,
        campaignId: campaignIdStr ? Number(campaignIdStr) : undefined,
        campaignName,
        csvFilePath,
        uploadedAt,
    };
}
function showUsage() {
    console.log(`
Lead Ledger (SQLite) - Record a manual Smartlead upload

Use this when you uploaded leads manually in the Smartlead UI, so your local ledger stays complete.

Usage:
  node --loader ts-node/esm scripts/ledger-record-upload.ts --campaignId=<ID> --csv=<PATH> [options]

Options:
  --clientId=<ID>           Optional: Smartlead client ID
  --clientName=<NAME>       Optional: stored in ledger_clients (used for readability)
  --campaignName=<NAME>     Optional campaign name for readability
  --uploadedAt=<ISO_DATE>   Optional ISO timestamp (defaults to now)

Env:
  LEAD_LEDGER_DB_PATH       Optional. Defaults to ./data/lead-ledger.sqlite
`);
}
async function main() {
    const args = parseArgs();
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
        showUsage();
        return;
    }
    if (!args.campaignId || !args.csvFilePath) {
        console.error("Error: --campaignId and --csv are required\n");
        showUsage();
        process.exit(1);
    }
    if (!fs.existsSync(args.csvFilePath)) {
        console.error(`Error: CSV not found: ${args.csvFilePath}`);
        process.exit(1);
    }
    const rows = await parseCSV(args.csvFilePath);
    if (rows.length === 0) {
        console.error("Error: CSV contains no rows");
        process.exit(1);
    }
    // De-dupe by email (case-insensitive)
    const rowByEmail = new Map();
    let skippedNoEmail = 0;
    for (const row of rows) {
        const mapped = mapCSVRowToLead(row, null);
        const email = mapped.email?.toLowerCase().trim();
        if (!email) {
            skippedNoEmail++;
            continue;
        }
        if (!rowByEmail.has(email))
            rowByEmail.set(email, row);
    }
    const dbPath = process.env.LEAD_LEDGER_DB_PATH || LeadLedger.defaultDbPath(process.cwd());
    const ledger = new LeadLedger(dbPath);
    ledger.init();
    if (args.clientId && args.clientName) {
        ledger.upsertClient({ clientId: args.clientId, clientName: args.clientName });
    }
    const uploadId = ledger.recordUpload({
        uploadedAt: args.uploadedAt,
        clientId: args.clientId,
        campaignId: args.campaignId,
        campaignName: args.campaignName,
        sourceCsvPath: args.csvFilePath,
    }, Array.from(rowByEmail.entries()).map(([email, row]) => ({ email, row })));
    ledger.close();
    console.log(`✅ Recorded manual upload`);
    console.log(`   DB: ${dbPath}`);
    console.log(`   Upload ID: ${uploadId}`);
    console.log(`   Campaign: ${args.campaignId}${args.campaignName ? ` (${args.campaignName})` : ""}`);
    console.log(`   CSV: ${args.csvFilePath}`);
    console.log(`   Leads recorded: ${rowByEmail.size.toLocaleString()}`);
    if (skippedNoEmail > 0) {
        console.log(`   Skipped (missing email): ${skippedNoEmail.toLocaleString()}`);
    }
}
main().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to record upload: ${msg}`);
    process.exitCode = 1;
});
