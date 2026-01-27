import fs from "fs/promises";
import path from "path";

interface UploadCheckpoint {
  campaignId: number;
  totalLeads: number;
  uploadedCount: number;
  lastBatchIndex: number; // Last successfully uploaded batch (0-indexed)
  timestamp: string;
}

const CHECKPOINT_DIR = ".upload-checkpoints";

/**
 * Get checkpoint file path for a campaign
 */
function getCheckpointPath(campaignId: number): string {
  return path.join(CHECKPOINT_DIR, `campaign-${campaignId}.json`);
}

/**
 * Ensure checkpoint directory exists
 */
async function ensureCheckpointDir(): Promise<void> {
  try {
    await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists, ignore
  }
}

/**
 * Save upload checkpoint
 */
export async function saveCheckpoint(
  campaignId: number,
  totalLeads: number,
  uploadedCount: number,
  lastBatchIndex: number
): Promise<void> {
  await ensureCheckpointDir();

  const checkpoint: UploadCheckpoint = {
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
export async function loadCheckpoint(
  campaignId: number
): Promise<UploadCheckpoint | null> {
  try {
    const checkpointPath = getCheckpointPath(campaignId);
    const data = await fs.readFile(checkpointPath, "utf-8");
    return JSON.parse(data) as UploadCheckpoint;
  } catch (error) {
    // Checkpoint doesn't exist
    return null;
  }
}

/**
 * Clear checkpoint after successful upload
 */
export async function clearCheckpoint(campaignId: number): Promise<void> {
  try {
    const checkpointPath = getCheckpointPath(campaignId);
    await fs.unlink(checkpointPath);
  } catch (error) {
    // Checkpoint doesn't exist, ignore
  }
}

/**
 * Check if there's a checkpoint for resuming
 */
export async function hasCheckpoint(campaignId: number): Promise<boolean> {
  const checkpoint = await loadCheckpoint(campaignId);
  return checkpoint !== null;
}
