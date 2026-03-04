import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Store mappings in a .mappings directory in the project root
const MAPPINGS_DIR = path.join(__dirname, "../../.mappings");
/**
 * Ensure the mappings directory exists
 */
async function ensureMappingsDir() {
    try {
        await fs.mkdir(MAPPINGS_DIR, { recursive: true });
    }
    catch (error) {
        // Directory already exists or error creating it
    }
}
/**
 * Get the file path for a client's mapping config
 */
function getMappingFilePath(clientId) {
    return path.join(MAPPINGS_DIR, `client-${clientId}.json`);
}
/**
 * Save field mapping configuration for a client
 */
export async function saveClientMapping(clientId, mappings) {
    await ensureMappingsDir();
    const config = {
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
export async function loadClientMapping(clientId) {
    try {
        const filePath = getMappingFilePath(clientId);
        const content = await fs.readFile(filePath, "utf-8");
        const config = JSON.parse(content);
        return config.mappings;
    }
    catch (error) {
        // File doesn't exist or error reading
        return null;
    }
}
/**
 * Check if a client has saved mappings
 */
export async function hasClientMapping(clientId) {
    const mapping = await loadClientMapping(clientId);
    return mapping !== null;
}
/**
 * Delete a client's mapping configuration
 */
export async function deleteClientMapping(clientId) {
    try {
        const filePath = getMappingFilePath(clientId);
        await fs.unlink(filePath);
    }
    catch (error) {
        // File doesn't exist or error deleting
    }
}
/**
 * Get all CSV columns from mappings (including aliases)
 */
export function getMappedColumns(mappings) {
    const columns = new Set();
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
export function findUnmappedColumns(csvColumns, mappings) {
    const mappedColumns = getMappedColumns(mappings);
    // All columns need mapping - no exclusions
    return csvColumns.filter((col) => !mappedColumns.has(col));
}
