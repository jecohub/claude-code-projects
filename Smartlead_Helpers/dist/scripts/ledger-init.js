import { LeadLedger } from "../src/features/lead-ledger/leadLedger.js";
function showUsage() {
    console.log(`
Lead Ledger (SQLite) - Init

Usage:
  node --loader ts-node/esm scripts/ledger-init.ts

Env:
  LEAD_LEDGER_DB_PATH   Optional. Defaults to ./data/lead-ledger.sqlite
`);
}
async function main() {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.includes("-h")) {
        showUsage();
        return;
    }
    const dbPath = process.env.LEAD_LEDGER_DB_PATH || LeadLedger.defaultDbPath(process.cwd());
    const ledger = new LeadLedger(dbPath);
    ledger.init();
    ledger.close();
    console.log(`✅ Lead ledger initialized: ${dbPath}`);
}
main().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to init lead ledger: ${msg}`);
    process.exitCode = 1;
});
