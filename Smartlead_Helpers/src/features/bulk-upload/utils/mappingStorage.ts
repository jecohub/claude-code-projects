import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store mappings in a .mappings directory in the project root
const MAPPINGS_DIR = path.join(__dirname, "../../../../.mappings");

export interface FieldMapping {
  csvColumn: string;
  aliases?: string[]; // Alternative column names that also map to this field
  smartleadField: "email" | "first_name" | "last_name" | "company_name" | "phone_number" | "website" | "location" | "linkedin_profile" | "company_url" | "custom";
  customFieldName?: string; // Only used when smartleadField is "custom"
}

export interface ClientFieldMappingConfig {
  clientId: string;
  mappings: FieldMapping[];
  savedAt: string;
}

/**
 * Ensure the mappings directory exists
 */
async function ensureMappingsDir(): Promise<void> {
  try {
    await fs.mkdir(MAPPINGS_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists or error creating it
  }
}

/**
 * Get the file path for a client's mapping config
 */
function getMappingFilePath(clientId: string): string {
  return path.join(MAPPINGS_DIR, `client-${clientId}.json`);
}

/**
 * Save field mapping configuration for a client
 */
export async function saveClientMapping(
  clientId: string,
  mappings: FieldMapping[]
): Promise<void> {
  await ensureMappingsDir();

  const config: ClientFieldMappingConfig = {
    clientId,
    mappings,
    savedAt: new Date().toISOString(),
  };

  const filePath = getMappingFilePath(clientId);
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Load field mapping configuration for a client
 * Returns null if no mapping exists
 */
export async function loadClientMapping(
  clientId: string
): Promise<FieldMapping[] | null> {
  try {
    const filePath = getMappingFilePath(clientId);
    const content = await fs.readFile(filePath, "utf-8");
    const config: ClientFieldMappingConfig = JSON.parse(content);
    return config.mappings;
  } catch (error) {
    // File doesn't exist or error reading
    return null;
  }
}

/**
 * Check if a client has saved mappings
 */
export async function hasClientMapping(clientId: string): Promise<boolean> {
  const mapping = await loadClientMapping(clientId);
  return mapping !== null;
}

/**
 * Delete a client's mapping configuration
 */
export async function deleteClientMapping(clientId: string): Promise<void> {
  try {
    const filePath = getMappingFilePath(clientId);
    await fs.unlink(filePath);
  } catch (error) {
    // File doesn't exist or error deleting
  }
}

/**
 * Get all CSV columns from mappings (including aliases)
 */
export function getMappedColumns(mappings: FieldMapping[]): Set<string> {
  const columns = new Set<string>();
  for (const m of mappings) {
    columns.add(m.csvColumn);
    if (m.aliases) {
      for (const alias of m.aliases) {
        columns.add(alias);
      }
    }
  }
  return columns;
}

/**
 * Find unmapped columns in a CSV
 * Considers both primary csvColumn and aliases
 */
export function findUnmappedColumns(
  csvColumns: string[],
  mappings: FieldMapping[]
): string[] {
  const mappedColumns = getMappedColumns(mappings);

  // All columns need mapping - no exclusions
  return csvColumns.filter((col) => !mappedColumns.has(col));
}
