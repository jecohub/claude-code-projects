import { promises as fs } from "fs";
import { parse } from "csv-parse/sync";
/**
 * Parse CSV file and return rows as key-value objects
 */
export async function parseCSV(filePath) {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
    return records;
}
/**
 * Find a column in the CSV row by checking various name variations (case-insensitive)
 */
function findColumn(row, possibleNames) {
    const rowKeys = Object.keys(row);
    for (const possibleName of possibleNames) {
        const matchingKey = rowKeys.find((key) => key.toLowerCase() === possibleName.toLowerCase());
        if (matchingKey) {
            return row[matchingKey];
        }
    }
    return undefined;
}
/**
 * Classify a lead based on ESP and email validity
 */
export function classifyLead(row) {
    // Find Email Host column (also accepts "ESP" as alias)
    const emailHost = findColumn(row, ["email host", "emailhost", "esp"]) || "";
    // Find Provider column (Final Provider or Provider)
    const provider = findColumn(row, ["final provider", "finalprovider", "provider"]) || "";
    // Classify ESP (case-insensitive check for "outlook")
    const isOutlook = emailHost.toLowerCase().includes("outlook");
    // Classify validity (case-insensitive check)
    const providerLower = provider.toLowerCase();
    const isCatchAll = providerLower.includes("bounceban");
    const isValid = providerLower.includes("million verifier");
    return {
        isOutlook,
        isValid,
        isCatchAll,
    };
}
/**
 * Classify all leads in the CSV
 */
export function classifyLeads(rows) {
    return rows.map((row) => ({
        row,
        classification: classifyLead(row),
    }));
}
/**
 * Determine the group type based on classification
 */
function getGroupType(classification) {
    if (classification.isOutlook && classification.isValid) {
        return "outlook-valid";
    }
    else if (classification.isOutlook && classification.isCatchAll) {
        return "outlook-catchall";
    }
    else if (!classification.isOutlook && classification.isValid) {
        return "nonoutlook-valid";
    }
    else {
        return "nonoutlook-catchall";
    }
}
/**
 * Group leads by their classification type
 */
export function groupLeadsByType(classifiedLeads) {
    const groups = new Map();
    for (const lead of classifiedLeads) {
        const groupType = getGroupType(lead.classification);
        if (!groups.has(groupType)) {
            groups.set(groupType, []);
        }
        // Store the original row (without classification)
        groups.get(groupType).push(lead.row);
    }
    return groups;
}
/**
 * Split an array into chunks of maximum size
 */
function chunkArray(array, maxSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += maxSize) {
        chunks.push(array.slice(i, i + maxSize));
    }
    return chunks;
}
/**
 * Get human-readable name for a group type
 */
function getGroupTypeName(groupType) {
    switch (groupType) {
        case "outlook-valid":
            return "Outlook Valid";
        case "outlook-catchall":
            return "Outlook Catchall";
        case "nonoutlook-valid":
            return "Non-Outlook Valid";
        case "nonoutlook-catchall":
            return "Non-Outlook Catchall";
    }
}
/**
 * Split grouped leads into chunks with campaign naming
 */
export function createLeadSplits(groupedLeads, baseCampaignName, maxLeadsPerSplit = 2000) {
    const splits = [];
    for (const [groupType, leads] of groupedLeads.entries()) {
        const chunks = chunkArray(leads, maxLeadsPerSplit);
        const groupTypeName = getGroupTypeName(groupType);
        chunks.forEach((chunk, index) => {
            const splitNumber = index + 1;
            const campaignName = `${baseCampaignName} - ${groupTypeName} ${splitNumber}`;
            splits.push({
                groupType,
                splitNumber,
                leads: chunk,
                campaignName,
            });
        });
    }
    return splits;
}
/**
 * Main function to process CSV file and create lead splits
 */
export async function processCSVForBulkUpload(filePath, baseCampaignName, maxLeadsPerSplit = 2000) {
    // Parse CSV
    const rows = await parseCSV(filePath);
    // Classify leads
    const classifiedLeads = classifyLeads(rows);
    // Group by type
    const groupedLeads = groupLeadsByType(classifiedLeads);
    // Create splits with campaign names
    const splits = createLeadSplits(groupedLeads, baseCampaignName, maxLeadsPerSplit);
    return splits;
}
