import fs from "node:fs";

import { LeadLedger } from "../src/features/lead-ledger/leadLedger.js";

type ClientRecord = { clientId: number; clientName: string };

function showUsage() {
  console.log(`
Lead Ledger (SQLite) - Import / Upsert clients

Usage:
  node --loader ts-node/esm scripts/ledger-import-clients.ts --file=<PATH>

File format:
  One client per line: <clientId><TAB><clientName>
  (CSV is also fine if it's: clientId,clientName)

Env:
  LEAD_LEDGER_DB_PATH   Optional. Defaults to ./data/lead-ledger.sqlite
`);
}

function parseArgs(): { filePath: string } {
  const args = process.argv.slice(2);
  const filePath = args
    .find((a) => a.startsWith("--file="))
    ?.split("=")
    .slice(1)
    .join("=");
  return { filePath: filePath || "./data/clients.tsv" };
}

function parseClientsFile(contents: string): ClientRecord[] {
  const lines = contents
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const clients: ClientRecord[] = [];

  for (const line of lines) {
    // Support either tab-separated or simple CSV (first comma splits).
    let idPart = "";
    let namePart = "";

    if (line.includes("\t")) {
      [idPart, namePart] = line.split("\t");
    } else if (line.includes(",")) {
      const idx = line.indexOf(",");
      idPart = line.slice(0, idx);
      namePart = line.slice(idx + 1);
    } else if (line.includes("|")) {
      // Also accept pipe tables like "123 | Name"
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      idPart = parts[0] || "";
      namePart = parts.slice(1).join(" | ");
    } else {
      continue;
    }

    const clientId = Number(String(idPart).trim());
    const clientName = String(namePart ?? "").trim();

    if (!Number.isFinite(clientId) || clientId <= 0 || !clientName) continue;

    clients.push({ clientId, clientName });
  }

  return clients;
}

async function main() {
  const args = parseArgs();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showUsage();
    return;
  }

  if (!fs.existsSync(args.filePath)) {
    console.error(`Error: file not found: ${args.filePath}`);
    process.exit(1);
  }

  const contents = fs.readFileSync(args.filePath, "utf-8");
  const clients = parseClientsFile(contents);

  if (clients.length === 0) {
    console.error("Error: no clients parsed from file (check formatting)");
    process.exit(1);
  }

  const dbPath =
    process.env.LEAD_LEDGER_DB_PATH || LeadLedger.defaultDbPath(process.cwd());

  const ledger = new LeadLedger(dbPath);
  ledger.init();
  const result = ledger.bulkUpsertClients(clients);
  ledger.close();

  console.log(`✅ Imported clients`);
  console.log(`   DB: ${dbPath}`);
  console.log(`   File: ${args.filePath}`);
  console.log(`   Upserted: ${result.upserted.toLocaleString()}`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`❌ Failed to import clients: ${msg}`);
  process.exitCode = 1;
});

