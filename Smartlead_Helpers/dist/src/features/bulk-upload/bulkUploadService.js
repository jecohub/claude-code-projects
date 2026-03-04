import { processCSVForBulkUpload, parseCSV } from "./csvProcessor.js";
import { mapCSVRowToLead, mapCSVRowsToLeads } from "./utils/fieldMapper.js";
import { loadClientMapping, findUnmappedColumns, } from "./utils/mappingStorage.js";
import { CONCURRENCY_LIMITS } from "../../core/config.js";
import { LeadLedger } from "../lead-ledger/leadLedger.js";
/**
 * Main orchestration service for bulk upload
 * Handles the complete workflow: CSV → Split → Duplicate → Upload
 */
export class BulkUploadService {
    constructor(client) {
        this.client = client;
    }
    /**
     * Best-effort local lead ledger (never blocks uploads).
     */
    getLeadLedger() {
        // tri-state: undefined = not attempted, null = unavailable, instance = ready
        if (this.leadLedger !== undefined)
            return this.leadLedger;
        try {
            const dbPath = process.env.LEAD_LEDGER_DB_PATH ||
                LeadLedger.defaultDbPath(process.cwd());
            const ledger = new LeadLedger(dbPath);
            ledger.init();
            this.leadLedger = ledger;
            return ledger;
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.leadLedger = null;
            console.warn(`⚠️  Lead ledger disabled (could not open SQLite DB): ${msg}`);
            return null;
        }
    }
    /**
     * Execute the complete bulk upload workflow
     */
    async execute(params) {
        const errors = [];
        const campaignResults = [];
        try {
            // Step 0: Handle field mappings
            let mappings = null;
            if (!params.isNewCampaign && params.clientId) {
                // Load saved mappings for existing campaign
                mappings = await loadClientMapping(params.clientId);
                if (!mappings) {
                    return {
                        success: false,
                        totalSplits: 0,
                        campaignResults: [],
                        summary: {
                            totalLeadsProcessed: 0,
                            totalLeadsUploaded: 0,
                            totalLeadsFailed: 0,
                            campaignsCreated: 0,
                        },
                        errors: [
                            `No saved field mappings found for Client ID: ${params.clientId}. ` +
                                `Please use isNewCampaign=true to preview and save mappings first, or call previewCSVMapping and saveFieldMapping.`,
                        ],
                    };
                }
                // Check for unmapped fields
                const csvRows = await parseCSV(params.csvFilePath);
                if (csvRows.length > 0) {
                    const csvColumns = Object.keys(csvRows[0]);
                    const unmappedColumns = findUnmappedColumns(csvColumns, mappings);
                    if (unmappedColumns.length > 0) {
                        return {
                            success: false,
                            totalSplits: 0,
                            campaignResults: [],
                            summary: {
                                totalLeadsProcessed: 0,
                                totalLeadsUploaded: 0,
                                totalLeadsFailed: 0,
                                campaignsCreated: 0,
                            },
                            errors: [
                                `New/unmapped columns detected in CSV: ${unmappedColumns.join(", ")}. ` +
                                    `Please call previewCSVMapping to review all fields, then saveFieldMapping with updated mappings.`,
                            ],
                        };
                    }
                }
            }
            else if (params.isNewCampaign && !params.clientId) {
                errors.push(`Warning: isNewCampaign=true but no clientId provided. Using auto-detection. ` +
                    `Provide clientId to save mappings for future use.`);
            }
            // Continue with existing workflow
            // (mappings will be null for auto-detection, or loaded mappings for saved config)
            // Step 1: Get source campaign name
            const sourceCampaign = await this.client.getCampaignDetails(params.sourceCampaignId);
            const baseCampaignName = sourceCampaign.name;
            // Step 2: Process CSV and create splits
            const splits = await processCSVForBulkUpload(params.csvFilePath, baseCampaignName);
            if (splits.length === 0) {
                return {
                    success: false,
                    totalSplits: 0,
                    campaignResults: [],
                    summary: {
                        totalLeadsProcessed: 0,
                        totalLeadsUploaded: 0,
                        totalLeadsFailed: 0,
                        campaignsCreated: 0,
                    },
                    errors: ["No leads found in CSV or unable to classify leads"],
                };
            }
            // Step 3: Process in two phases - clone all campaigns first, then upload all leads
            let totalLeadsProcessed = 0;
            let totalLeadsUploaded = 0;
            let totalLeadsFailed = 0;
            let campaignsCreated = 0;
            // PHASE 1: Duplicate all campaigns IN PARALLEL
            console.log("\n=== PHASE 1: DUPLICATING CAMPAIGNS ===\n");
            const campaignMappings = new Map();
            // Process campaigns in parallel batches
            const concurrency = CONCURRENCY_LIMITS.CAMPAIGN_DUPLICATION;
            for (let i = 0; i < splits.length; i += concurrency) {
                const batch = splits.slice(i, i + concurrency);
                const duplicationPromises = batch.map(async (split) => {
                    try {
                        console.log(`Duplicating campaign for ${split.groupType} split ${split.splitNumber}...`);
                        const duplicationResult = await this.client.duplicateCampaign(params.sourceCampaignId, split.campaignName, params.clientId, {
                            throwOnError: false,
                            verifyAfterCopy: true,
                            verbose: false,
                            retryAttempts: 2,
                        });
                        const key = `${split.groupType}-${split.splitNumber}`;
                        const duplicationErrors = [];
                        if (!duplicationResult.success) {
                            duplicationErrors.push(...duplicationResult.errors.map((e) => `Duplication: ${e}`));
                        }
                        console.log(`  ✓ Campaign ${duplicationResult.campaignId} created for ${split.groupType} split ${split.splitNumber}`);
                        return {
                            key,
                            campaignId: duplicationResult.campaignId,
                            errors: duplicationErrors,
                            warnings: duplicationResult.warnings,
                        };
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        const key = `${split.groupType}-${split.splitNumber}`;
                        console.error(`  ❌ Failed to duplicate campaign for "${split.campaignName}": ${errorMessage}`);
                        return {
                            key,
                            campaignId: -1,
                            errors: [errorMessage],
                            warnings: [],
                        };
                    }
                });
                // Wait for all duplications in this batch to complete
                const results = await Promise.allSettled(duplicationPromises);
                // Process results
                results.forEach((result) => {
                    if (result.status === "fulfilled") {
                        const { key, campaignId, errors: dupErrors, warnings } = result.value;
                        campaignMappings.set(key, {
                            campaignId,
                            errors: dupErrors,
                            warnings,
                        });
                    }
                    else {
                        // Promise rejected - shouldn't happen with try-catch above
                        console.error(`  Campaign duplication promise rejected unexpectedly`);
                    }
                });
            }
            // Check if all duplications failed
            const allFailed = Array.from(campaignMappings.values()).every(m => m.campaignId === -1);
            if (allFailed) {
                return {
                    success: false,
                    totalSplits: splits.length,
                    campaignResults: [],
                    summary: {
                        totalLeadsProcessed: 0,
                        totalLeadsUploaded: 0,
                        totalLeadsFailed: 0,
                        campaignsCreated: 0,
                    },
                    errors: ['All campaign duplications failed', ...errors],
                };
            }
            // PHASE 2: Upload leads to all campaigns
            console.log("\n=== PHASE 2: UPLOADING LEADS ===\n");
            for (const split of splits) {
                const key = `${split.groupType}-${split.splitNumber}`;
                const mapping = campaignMappings.get(key);
                if (!mapping || mapping.campaignId === -1) {
                    // Campaign duplication failed
                    campaignResults.push({
                        campaignId: -1,
                        campaignName: split.campaignName,
                        groupType: split.groupType,
                        splitNumber: split.splitNumber,
                        totalLeads: split.leads.length,
                        uploadedLeads: 0,
                        failedLeads: split.leads.length,
                        errors: mapping?.errors || ['Campaign duplication failed'],
                    });
                    totalLeadsProcessed += split.leads.length;
                    totalLeadsFailed += split.leads.length;
                    continue;
                }
                // Upload leads to the duplicated campaign
                try {
                    console.log(`Uploading ${split.leads.length} leads to campaign ${mapping.campaignId}...`);
                    const result = await this.uploadLeadsToExistingCampaign(mapping.campaignId, split, params.ignoreGlobalBlockList, mappings, params.csvFilePath, params.clientId);
                    // Add duplication warnings/errors to the result
                    result.errors.push(...mapping.errors);
                    result.errors.push(...mapping.warnings.map(w => `Warning: ${w}`));
                    campaignResults.push(result);
                    totalLeadsProcessed += result.totalLeads;
                    totalLeadsUploaded += result.uploadedLeads;
                    totalLeadsFailed += result.failedLeads;
                    if (result.uploadedLeads > 0 || result.failedLeads > 0) {
                        campaignsCreated++;
                    }
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to upload leads for "${split.campaignName}": ${errorMessage}`);
                    campaignResults.push({
                        campaignId: mapping.campaignId,
                        campaignName: split.campaignName,
                        groupType: split.groupType,
                        splitNumber: split.splitNumber,
                        totalLeads: split.leads.length,
                        uploadedLeads: 0,
                        failedLeads: split.leads.length,
                        errors: [...mapping.errors, errorMessage],
                    });
                    totalLeadsProcessed += split.leads.length;
                    totalLeadsFailed += split.leads.length;
                }
            }
            // PHASE 3: Verify actual lead counts in each campaign
            console.log("\n=== PHASE 3: VERIFYING UPLOADS ===\n");
            let totalLeadsVerified = 0;
            for (const result of campaignResults) {
                if (result.campaignId <= 0)
                    continue;
                try {
                    const actualLeads = await this.client.getCampaignLeads(result.campaignId);
                    result.verifiedLeadCount = actualLeads.length;
                    totalLeadsVerified += actualLeads.length;
                    const match = actualLeads.length === result.uploadedLeads;
                    const icon = match ? "✓" : "⚠️";
                    console.log(`  ${icon} Campaign ${result.campaignId}: ${actualLeads.length} verified` +
                        (match ? "" : ` (API reported ${result.uploadedLeads})`));
                }
                catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    console.warn(`  ⚠️  Could not verify campaign ${result.campaignId}: ${msg}`);
                }
            }
            // Log performance statistics
            console.log("\n=== PERFORMANCE STATISTICS ===");
            const stats = this.client.getRateLimiterStats();
            console.log(`Campaign Operations: ${stats.campaignOps.totalRequests} requests (${stats.campaignOps.throttleRate.toFixed(1)}% throttled)`);
            console.log(`Lead Uploads: ${stats.leadUploads.totalRequests} requests (${stats.leadUploads.throttleRate.toFixed(1)}% throttled)`);
            console.log(`Read Operations: ${stats.readOps.totalRequests} requests (${stats.readOps.throttleRate.toFixed(1)}% throttled)`);
            return {
                success: errors.length === 0,
                totalSplits: splits.length,
                campaignResults,
                summary: {
                    totalLeadsProcessed,
                    totalLeadsUploaded,
                    totalLeadsFailed,
                    totalLeadsVerified,
                    campaignsCreated,
                },
                errors,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Bulk upload failed: ${errorMessage}`);
            return {
                success: false,
                totalSplits: 0,
                campaignResults,
                summary: {
                    totalLeadsProcessed: 0,
                    totalLeadsUploaded: 0,
                    totalLeadsFailed: 0,
                    campaignsCreated: 0,
                },
                errors,
            };
        }
    }
    /**
     * Upload leads to an existing campaign
     * Used in Phase 2 after all campaigns have been duplicated
     */
    async uploadLeadsToExistingCampaign(campaignId, split, ignoreGlobalBlockList, mappings, sourceCsvPath, clientId) {
        const errors = [];
        // Convert CSV rows to Lead objects using saved mappings
        const leads = mapCSVRowsToLeads(split.leads, mappings);
        if (leads.length === 0) {
            return {
                campaignId,
                campaignName: split.campaignName,
                groupType: split.groupType,
                splitNumber: split.splitNumber,
                totalLeads: split.leads.length,
                uploadedLeads: 0,
                failedLeads: split.leads.length,
                errors: ["No valid leads found after field mapping"],
            };
        }
        // Upload leads to campaign
        try {
            const uploadResponse = await this.client.addLeadsToCampaign(campaignId, leads, {
                ignoreGlobalBlockList: ignoreGlobalBlockList ?? false,
                ignoreUnsubscribeList: false,
                ignoreDuplicateLeadsInOtherCampaign: false,
            });
            console.log(`  ✓ Uploaded ${uploadResponse.uploaded_count ?? 0} leads`);
            const uploaded = uploadResponse.uploaded_count ?? 0;
            const failed = leads.length - uploaded;
            // Best-effort: record to local lead ledger for retargeting (never blocks upload)
            try {
                const ledger = this.getLeadLedger();
                if (ledger) {
                    const rowByEmail = new Map();
                    for (const row of split.leads) {
                        const mapped = mapCSVRowToLead(row, mappings);
                        const email = mapped.email?.toLowerCase().trim();
                        if (!email)
                            continue;
                        if (!rowByEmail.has(email))
                            rowByEmail.set(email, row);
                    }
                    const emailsToRecord = uploadResponse.ledger_new_lead_emails?.length
                        ? uploadResponse.ledger_new_lead_emails
                        : leads.map((l) => l.email.toLowerCase());
                    const leadRows = emailsToRecord.map((email) => ({
                        email,
                        row: rowByEmail.get(email.toLowerCase()) ?? { email },
                    }));
                    ledger.recordUpload({
                        uploadedAt: new Date(),
                        clientId: clientId && Number.isFinite(Number(clientId))
                            ? Number(clientId)
                            : undefined,
                        campaignId,
                        campaignName: split.campaignName,
                        sourceCsvPath,
                        groupType: split.groupType,
                        splitNumber: split.splitNumber,
                        apiUploadCount: uploadResponse.upload_count,
                        apiDuplicateCount: uploadResponse.duplicate_count,
                        apiInvalidEmailCount: uploadResponse.invalid_email_count,
                        apiUnsubscribedCount: uploadResponse.unsubscribed_count,
                    }, leadRows);
                    if (uploadResponse.invalid_emails?.length) {
                        ledger.bulkUpsertLeadStatus(uploadResponse.invalid_emails, {
                            invalidEmail: true,
                        });
                    }
                    if (uploadResponse.unsubscribed_leads?.length) {
                        ledger.bulkUpsertLeadStatus(uploadResponse.unsubscribed_leads, {
                            unsubscribed: true,
                        });
                    }
                }
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.warn(`⚠️  Lead ledger warning: ${msg}`);
            }
            if (uploadResponse.duplicate_count > 0) {
                errors.push(`${uploadResponse.duplicate_count} duplicates detected`);
            }
            if (uploadResponse.invalid_email_count > 0) {
                errors.push(`${uploadResponse.invalid_email_count} invalid emails`);
            }
            if ((uploadResponse.unsubscribed_count ?? 0) > 0) {
                errors.push(`${uploadResponse.unsubscribed_count} unsubscribed`);
            }
            return {
                campaignId,
                campaignName: split.campaignName,
                groupType: split.groupType,
                splitNumber: split.splitNumber,
                totalLeads: leads.length,
                uploadedLeads: uploaded,
                failedLeads: failed,
                errors,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Upload failed: ${errorMessage}`);
            return {
                campaignId,
                campaignName: split.campaignName,
                groupType: split.groupType,
                splitNumber: split.splitNumber,
                totalLeads: leads.length,
                uploadedLeads: 0,
                failedLeads: leads.length,
                errors,
            };
        }
    }
}
