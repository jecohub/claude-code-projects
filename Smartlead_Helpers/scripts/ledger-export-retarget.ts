import { LeadLedger } from "../src/features/lead-ledger/leadLedger.js";

interface CliArgs {
  days: number;
  outFilePath?: string;
  clientId?: number;
  campaignId?: number;
  includeInvalid: boolean;
  includeUnsubscribed: boolean;
  limit?: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  const daysStr = args.find((a) => a.startsWith("--days="))?.split("=")[1];
  const outFilePath = args
    .find((a) => a.startsWith("--out="))
    ?.split("=")
    .slice(1)
    .join("=");

  const clientIdStr = args
    .find((a) => a.startsWith("--clientId="))
    ?.split("=")[1];

  const campaignIdStr = args
    .find((a) => a.startsWith("--campaignId="))
    ?.split("=")[1];

  const includeInvalid =
    args.includes("--includeInvalid") ||
    args.find((a) => a.startsWith("--includeInvalid="))?.split("=")[1] ===
      "true";

  const includeUnsubscribed =
    args.includes("--includeUnsubscribed") ||
    args
      .find((a) => a.startsWith("--includeUnsubscribed="))
      ?.split("=")[1] === "true";

  const limitStr = args.find((a) => a.startsWith("--limit="))?.split("=")[1];

  return {
    days: daysStr ? Number(daysStr) : 90,
    outFilePath,
    clientId: clientIdStr ? Number(clientIdStr) : undefined,
    campaignId: campaignIdStr ? Number(campaignIdStr) : undefined,
    includeInvalid,
    includeUnsubscribed,
    limit: limitStr ? Number(limitStr) : undefined,
  };
}

function showUsage() {
  console.log(`
Lead Ledger (SQLite) - Export retarget-ready CSV

Usage:
  node --loader ts-node/esm scripts/ledger-export-retarget.ts --out=<PATH> [options]

Options:
  --days=<N>                 Defaults to 90
  --clientId=<ID>            Optional: only leads last uploaded under this Smartlead client
  --campaignId=<ID>          Optional: only leads last uploaded to this campaign
  --includeInvalid           Include invalid emails (normally excluded)
  --includeUnsubscribed      Include unsubscribed leads (normally excluded)
  --limit=<N>                Safety limit (defaults to 100000)

Env:
  LEAD_LEDGER_DB_PATH        Optional. Defaults to ./data/lead-ledger.sqlite
`);
}

async function main() {
  const args = parseArgs();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showUsage();
    return;
  }

  if (!args.outFilePath) {
    console.error("Error: --out is required\n");
    showUsage();
    process.exit(1);
  }

  const dbPath =
    process.env.LEAD_LEDGER_DB_PATH || LeadLedger.defaultDbPath(process.cwd());
  const ledger = new LeadLedger(dbPath);
  ledger.init();

  const result = ledger.exportEligibleToCsv({
    days: args.days,
    outFilePath: args.outFilePath,
    clientId: args.clientId,
    campaignId: args.campaignId,
    includeInvalid: args.includeInvalid,
    includeUnsubscribed: args.includeUnsubscribed,
    limit: args.limit,
  });

  ledger.close();

  console.log(`✅ Export complete`);
  console.log(`   DB: ${dbPath}`);
  console.log(`   Days: ${args.days}`);
  if (typeof args.clientId === "number") {
    console.log(`   Client filter: ${args.clientId}`);
  }
  if (typeof args.campaignId === "number") {
    console.log(`   Campaign filter: ${args.campaignId}`);
  }
  console.log(`   Exported: ${result.exported.toLocaleString()}`);
  console.log(`   Output: ${result.outFilePath}`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`❌ Failed to export: ${msg}`);
  process.exitCode = 1;
});

