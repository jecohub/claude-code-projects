import dotenv from "dotenv";
import path from "node:path";
dotenv.config();
const DEFAULT_BASE_URL = "https://server.smartlead.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 120000; // Increased to 120s for large lead uploads
const DEFAULT_LEAD_LEDGER_DB_PATH = path.join(process.cwd(), "data", "lead-ledger.sqlite");
// Rate Limiting Configuration
export const RATE_LIMITS = {
    // Campaign operations (create, update settings, schedule, sequences)
    CAMPAIGN_OPERATIONS: {
        maxRequests: parseInt(process.env.CAMPAIGN_RATE_LIMIT || "50", 10),
        timeWindowMs: 1000, // 50 req/sec
    },
    // Lead upload operations (POST to /campaigns/{id}/leads)
    LEAD_UPLOADS: {
        maxRequests: parseInt(process.env.LEAD_UPLOAD_RATE_LIMIT || "300", 10),
        timeWindowMs: 1000, // 300 req/sec (conservative from 400 available)
    },
    // GET operations (duplicate detection, campaign fetching)
    READ_OPERATIONS: {
        maxRequests: parseInt(process.env.READ_RATE_LIMIT || "100", 10),
        timeWindowMs: 1000, // 100 req/sec
    },
};
// Concurrency Configuration
export const CONCURRENCY_LIMITS = {
    // How many batch uploads to run in parallel
    BATCH_UPLOADS: parseInt(process.env.BATCH_UPLOAD_CONCURRENCY || "5", 10),
    // How many pagination requests for duplicate detection
    DUPLICATE_DETECTION: parseInt(process.env.DUPLICATE_DETECTION_CONCURRENCY || "3", 10),
    // How many campaigns to duplicate in parallel
    CAMPAIGN_DUPLICATION: parseInt(process.env.CAMPAIGN_DUPLICATION_CONCURRENCY || "2", 10),
};
export function getConfig() {
    const apiKey = process.env.SMARTLEAD_API_KEY;
    if (!apiKey) {
        throw new Error("Missing SMARTLEAD_API_KEY. Set it in the environment or a .env file.");
    }
    return {
        apiKey,
        baseUrl: process.env.SMARTLEAD_BASE_URL || DEFAULT_BASE_URL,
        requestTimeoutMs: Number(process.env.SMARTLEAD_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
        webAuthToken: process.env.SMARTLEAD_WEB_AUTH_TOKEN,
        leadLedgerDbPath: process.env.LEAD_LEDGER_DB_PATH || DEFAULT_LEAD_LEDGER_DB_PATH,
    };
}
