import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
let cachedBetterSqlite3 = null;
function loadBetterSqlite3() {
    if (cachedBetterSqlite3)
        return cachedBetterSqlite3;
    // Lazy-load so ledger failures never block importing the rest of the project.
    const require = createRequire(import.meta.url);
    cachedBetterSqlite3 = require("better-sqlite3");
    return cachedBetterSqlite3;
}
function toIsoString(value) {
    if (!value)
        return new Date().toISOString();
    if (value instanceof Date)
        return value.toISOString();
    // If caller passes an ISO-ish string, store as-is (still sortable for ISO format)
    return value;
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function ensureParentDir(filePath) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
}
function encodeCsvCell(value) {
    // RFC 4180-ish: wrap in quotes if contains comma, quote, or newline; escape quotes by doubling.
    if (value.includes('"'))
        value = value.replace(/"/g, '""');
    const needsQuotes = value.includes(",") || value.includes("\n") || value.includes("\r") || value.includes('"');
    return needsQuotes ? `"${value}"` : value;
}
export class LeadLedger {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.initialized = false;
        ensureParentDir(dbPath);
        const BetterSqlite3 = loadBetterSqlite3();
        this.db = new BetterSqlite3(dbPath);
        // Pragmas for decent durability + performance on local file
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
    }
    static defaultDbPath(projectRoot) {
        return path.join(projectRoot, "data", "lead-ledger.sqlite");
    }
    close() {
        this.db.close();
    }
    init() {
        if (this.initialized)
            return { created: false };
        // Create tables if they don't exist
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_clients (
        client_id INTEGER PRIMARY KEY,
        client_name TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_uploads (
        upload_id INTEGER PRIMARY KEY AUTOINCREMENT,
        uploaded_at TEXT NOT NULL,
        client_id INTEGER,
        campaign_id INTEGER NOT NULL,
        campaign_name TEXT,
        source_csv_path TEXT,
        group_type TEXT,
        split_number INTEGER,
        api_upload_count INTEGER,
        api_duplicate_count INTEGER,
        api_invalid_email_count INTEGER,
        api_unsubscribed_count INTEGER
      );

      CREATE TABLE IF NOT EXISTS ledger_upload_leads (
        upload_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        row_json TEXT NOT NULL,
        PRIMARY KEY (upload_id, email),
        FOREIGN KEY (upload_id) REFERENCES ledger_uploads(upload_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ledger_lead_status (
        email TEXT PRIMARY KEY,
        invalid_email INTEGER NOT NULL DEFAULT 0,
        unsubscribed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_upload_leads_email ON ledger_upload_leads(email);
      CREATE INDEX IF NOT EXISTS idx_ledger_uploads_uploaded_at ON ledger_uploads(uploaded_at);
      CREATE INDEX IF NOT EXISTS idx_ledger_uploads_campaign_id ON ledger_uploads(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_uploads_client_id ON ledger_uploads(client_id);
    `);
        // Lightweight schema migrations for existing DBs
        this.ensureColumnExists("ledger_uploads", "client_id", "INTEGER");
        this.initialized = true;
        return { created: true };
    }
    ensureColumnExists(tableName, columnName, columnType) {
        const pragmaStmt = this.db.prepare(`PRAGMA table_info(${tableName});`);
        const cols = pragmaStmt.all();
        const has = cols.some((c) => String(c.name) === columnName);
        if (has)
            return;
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType};`);
    }
    upsertClient(client) {
        this.init();
        const stmt = this.db.prepare(`
      INSERT INTO ledger_clients (client_id, client_name, updated_at)
      VALUES (@client_id, @client_name, @updated_at)
      ON CONFLICT(client_id) DO UPDATE SET
        client_name = excluded.client_name,
        updated_at = excluded.updated_at;
    `);
        stmt.run({
            client_id: client.clientId,
            client_name: client.clientName,
            updated_at: new Date().toISOString(),
        });
    }
    bulkUpsertClients(clients) {
        this.init();
        const tx = this.db.transaction(() => {
            let upserted = 0;
            for (const c of clients) {
                this.upsertClient(c);
                upserted++;
            }
            return { upserted };
        });
        return tx();
    }
    /**
     * Record a single upload event plus the set of leads actually uploaded.
     * This should be called AFTER the Smartlead upload succeeds, using a best-effort list of uploaded emails.
     */
    recordUpload(meta, leads) {
        this.init();
        const uploadedAt = toIsoString(meta.uploadedAt);
        const insertUpload = this.db.prepare(`
      INSERT INTO ledger_uploads (
        uploaded_at,
        client_id,
        campaign_id,
        campaign_name,
        source_csv_path,
        group_type,
        split_number,
        api_upload_count,
        api_duplicate_count,
        api_invalid_email_count,
        api_unsubscribed_count
      ) VALUES (
        @uploaded_at,
        @client_id,
        @campaign_id,
        @campaign_name,
        @source_csv_path,
        @group_type,
        @split_number,
        @api_upload_count,
        @api_duplicate_count,
        @api_invalid_email_count,
        @api_unsubscribed_count
      );
    `);
        const insertLead = this.db.prepare(`
      INSERT OR REPLACE INTO ledger_upload_leads (upload_id, email, row_json)
      VALUES (@upload_id, @email, @row_json);
    `);
        const tx = this.db.transaction(() => {
            const result = insertUpload.run({
                uploaded_at: uploadedAt,
                client_id: meta.clientId ?? null,
                campaign_id: meta.campaignId,
                campaign_name: meta.campaignName ?? null,
                source_csv_path: meta.sourceCsvPath ?? null,
                group_type: meta.groupType ?? null,
                split_number: meta.splitNumber ?? null,
                api_upload_count: meta.apiUploadCount ?? null,
                api_duplicate_count: meta.apiDuplicateCount ?? null,
                api_invalid_email_count: meta.apiInvalidEmailCount ?? null,
                api_unsubscribed_count: meta.apiUnsubscribedCount ?? null,
            });
            const uploadId = Number(result.lastInsertRowid);
            for (const lead of leads) {
                const email = normalizeEmail(lead.email);
                if (!email)
                    continue;
                insertLead.run({
                    upload_id: uploadId,
                    email,
                    row_json: JSON.stringify(lead.row),
                });
            }
            return uploadId;
        });
        return tx();
    }
    upsertLeadStatus(email, status) {
        this.init();
        const normalized = normalizeEmail(email);
        if (!normalized)
            return;
        const stmt = this.db.prepare(`
      INSERT INTO ledger_lead_status (email, invalid_email, unsubscribed, updated_at)
      VALUES (@email, @invalid_email, @unsubscribed, @updated_at)
      ON CONFLICT(email) DO UPDATE SET
        invalid_email = MAX(invalid_email, excluded.invalid_email),
        unsubscribed = MAX(unsubscribed, excluded.unsubscribed),
        updated_at = excluded.updated_at;
    `);
        stmt.run({
            email: normalized,
            invalid_email: status.invalidEmail ? 1 : 0,
            unsubscribed: status.unsubscribed ? 1 : 0,
            updated_at: new Date().toISOString(),
        });
    }
    bulkUpsertLeadStatus(emails, status) {
        this.init();
        const tx = this.db.transaction(() => {
            let updated = 0;
            for (const email of emails) {
                this.upsertLeadStatus(email, status);
                updated++;
            }
            return { updated };
        });
        return tx();
    }
    /**
     * Return eligible leads for retargeting, based on last upload time.
     * Eligibility = last_uploaded_at <= now - days AND not invalid/unsubscribed (when known).
     */
    getEligibleLeads(params) {
        this.init();
        const cutoff = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString();
        const limit = params.limit ?? 100000;
        const whereCampaign = typeof params.campaignId === "number" ? "AND lu.campaign_id = @campaign_id" : "";
        const whereClient = typeof params.clientId === "number" ? "AND lu.client_id = @client_id" : "";
        const excludeInvalid = params.includeInvalid ? "" : "AND COALESCE(ls.invalid_email, 0) = 0";
        const excludeUnsubscribed = params.includeUnsubscribed ? "" : "AND COALESCE(ls.unsubscribed, 0) = 0";
        // Strategy:
        // 1) Rank uploads per email (ORDER BY uploaded_at DESC, upload_id DESC)
        // 2) Pick the most recent per email, then filter by cutoff
        // 3) Fetch row_json from that upload_id (no timestamp collisions)
        const stmt = this.db.prepare(`
      WITH ranked_uploads AS (
        SELECT
          lul.email AS email,
          lu.upload_id AS upload_id,
          lu.uploaded_at AS uploaded_at,
          ROW_NUMBER() OVER (
            PARTITION BY lul.email
            ORDER BY lu.uploaded_at DESC, lu.upload_id DESC
          ) AS rn
        FROM ledger_upload_leads lul
        JOIN ledger_uploads lu ON lu.upload_id = lul.upload_id
        WHERE 1=1
          ${whereCampaign}
          ${whereClient}
      ),
      last_per_email AS (
        SELECT
          email,
          upload_id,
          uploaded_at
        FROM ranked_uploads
        WHERE rn = 1
      ),
      eligible AS (
        SELECT
          email,
          upload_id,
          uploaded_at
        FROM last_per_email
        WHERE uploaded_at <= @cutoff
      )
      SELECT
        e.email AS email,
        e.uploaded_at AS last_uploaded_at,
        lu.campaign_id AS campaign_id,
        lu.campaign_name AS campaign_name,
        lul.row_json AS row_json,
        ls.invalid_email AS invalid_email,
        ls.unsubscribed AS unsubscribed
      FROM eligible e
      JOIN ledger_uploads lu ON lu.upload_id = e.upload_id
      JOIN ledger_upload_leads lul ON lul.upload_id = e.upload_id AND lul.email = e.email
      LEFT JOIN ledger_lead_status ls ON ls.email = e.email
      WHERE 1=1
        ${excludeInvalid}
        ${excludeUnsubscribed}
      ORDER BY e.uploaded_at ASC
      LIMIT @limit;
    `);
        const rows = stmt.all({
            cutoff,
            campaign_id: params.campaignId ?? null,
            client_id: params.clientId ?? null,
            limit,
        });
        return rows.map((r) => ({
            email: r.email,
            lastUploadedAt: r.last_uploaded_at,
            lastCampaignId: r.campaign_id,
            lastCampaignName: r.campaign_name,
            row: JSON.parse(r.row_json),
        }));
    }
    /**
     * Export eligible leads to a clean CSV based on the stored original LeadRow JSON.
     * We union all keys across rows to produce a stable header.
     */
    exportEligibleToCsv(params) {
        const eligible = this.getEligibleLeads({
            days: params.days,
            campaignId: params.campaignId,
            clientId: params.clientId,
            includeInvalid: params.includeInvalid,
            includeUnsubscribed: params.includeUnsubscribed,
            limit: params.limit,
        });
        // Union all columns across rows
        const headerSet = new Set();
        for (const lead of eligible) {
            Object.keys(lead.row).forEach((k) => headerSet.add(k));
        }
        // Ensure email column is present and first if possible
        const headers = Array.from(headerSet);
        const emailIdx = headers.findIndex((h) => h.toLowerCase().trim() === "email");
        if (emailIdx >= 0) {
            headers.splice(emailIdx, 1);
            headers.unshift("email");
        }
        else {
            headers.unshift("email");
        }
        const lines = [];
        lines.push(headers.map(encodeCsvCell).join(","));
        for (const lead of eligible) {
            const row = lead.row;
            const values = headers.map((h) => {
                const v = row[h] ?? (h === "email" ? lead.email : "");
                return encodeCsvCell(String(v ?? ""));
            });
            lines.push(values.join(","));
        }
        ensureParentDir(params.outFilePath);
        fs.writeFileSync(params.outFilePath, lines.join("\n"), "utf-8");
        return { exported: eligible.length, outFilePath: params.outFilePath };
    }
}
