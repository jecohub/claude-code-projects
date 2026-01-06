import dotenv from "dotenv";

dotenv.config();

export interface SmartleadConfig {
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
}

const DEFAULT_BASE_URL = "https://server.smartlead.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 30000; // Increased to 30s for large campaigns

export function getConfig(): SmartleadConfig {
  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing SMARTLEAD_API_KEY. Set it in the environment or a .env file.",
    );
  }

  return {
    apiKey,
    baseUrl: process.env.SMARTLEAD_BASE_URL || DEFAULT_BASE_URL,
    requestTimeoutMs:
      Number(process.env.SMARTLEAD_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

