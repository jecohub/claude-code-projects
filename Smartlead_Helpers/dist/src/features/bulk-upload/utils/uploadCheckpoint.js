import fs from "fs/promises";
import path from "path";
const CHECKPOINT_DIR = ".upload-checkpoints";
/**
 * Get checkpoint file path for a campaign
 */
function getCheckpointPath(campaignId) {
    return path.join(CHECKPOINT_DIR, `campaign-${campaignId}.json`);
}
/**
 * Ensure checkpoint directory exists
 */
async function ensureCheckpointDir() {
    try {
        await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
    }
    catch (error) {
        // Directory already exists, ignore
    }
}
/**
 * Save upload checkpoint
 */
export async function saveCheckpoint(campaignId, totalLeads, uploadedCount, lastBatchIndex) {
    await ensureCheckpointDir();
    const checkpoint = {
        campaignId,
        totalLeads,
        uploadedCount,
        lastBatchIndex,
        timestamp: new Date().toISOString(),
    };
    const checkpointPath = getCheckpointPath(campaignId);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
}
/**
 * Load upload checkpoint if exists
 */
export async function loadCheckpoint(campaignId) {
    try {
        const checkpointPath = getCheckpointPath(campaignId);
        const data = await fs.readFile(checkpointPath, "utf-8");
        return JSON.parse(data);
    }
    catch (error) {
        // Checkpoint doesn't exist
        return null;
    }
}
/**
 * Clear checkpoint after successful upload
 */
export async function clearCheckpoint(campaignId) {
    try {
        const checkpointPath = getCheckpointPath(campaignId);
        await fs.unlink(checkpointPath);
    }
    catch (error) {
        // Checkpoint doesn't exist, ignore
    }
}
/**
 * Check if there's a checkpoint for resuming
 */
export async function hasCheckpoint(campaignId) {
    const checkpoint = await loadCheckpoint(campaignId);
    return checkpoint !== null;
}
