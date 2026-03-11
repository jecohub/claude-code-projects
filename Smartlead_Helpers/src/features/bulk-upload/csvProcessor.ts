import { promises as fs } from "fs";
import { parse } from "csv-parse/sync";
import {
  LeadRow,
  LeadClassification,
  ClassifiedLead,
  GroupType,
  LeadSplit,
} from "../../core/types.js";

/**
 * Parse CSV file and return rows as key-value objects
 */
export async function parseCSV(filePath: string): Promise<LeadRow[]> {
  const fileContent = await fs.readFile(filePath, "utf-8");

  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records as LeadRow[];
}

/**
 * Find a column in the CSV row by checking various name variations (case-insensitive)
 */
function findColumn(
  row: LeadRow,
  possibleNames: string[]
): string | undefined {
  const rowKeys = Object.keys(row);

  for (const possibleName of possibleNames) {
    const matchingKey = rowKeys.find(
      (key) => key.toLowerCase() === possibleName.toLowerCase()
    );
    if (matchingKey) {
      return row[matchingKey];
    }
  }

  return undefined;
}

/**
 * Classify a lead based on ESP and email validity
 */
export function classifyLead(row: LeadRow): LeadClassification {
  // Find Email Host column (also accepts "ESP" as alias)
  const emailHost = findColumn(row, ["email host", "emailhost", "esp"]) || "";

  // Find Provider column (Final Provider or Provider)
  const provider =
    findColumn(row, ["final provider", "finalprovider", "provider"]) || "";

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
export function classifyLeads(rows: LeadRow[]): ClassifiedLead[] {
  return rows.map((row) => ({
    row,
    classification: classifyLead(row),
  }));
}

/**
 * Determine the group type based on classification
 */
function getGroupType(classification: LeadClassification): GroupType {
  if (classification.isOutlook && classification.isValid) {
    return "outlook-valid";
  } else if (classification.isOutlook && classification.isCatchAll) {
    return "outlook-catchall";
  } else if (!classification.isOutlook && classification.isValid) {
    return "nonoutlook-valid";
  } else {
    return "nonoutlook-catchall";
  }
}

/**
 * Group leads by their classification type
 */
export function groupLeadsByType(
  classifiedLeads: ClassifiedLead[]
): Map<GroupType, LeadRow[]> {
  const groups = new Map<GroupType, LeadRow[]>();

  for (const lead of classifiedLeads) {
    const groupType = getGroupType(lead.classification);

    if (!groups.has(groupType)) {
      groups.set(groupType, []);
    }

    // Store the original row (without classification)
    groups.get(groupType)!.push(lead.row);
  }

  return groups;
}

/**
 * Get human-readable name for a group type
 */
function getGroupTypeName(groupType: GroupType): string {
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
 * Split grouped leads into one split per group type with campaign naming
 */
export function createLeadSplits(
  groupedLeads: Map<GroupType, LeadRow[]>,
  baseCampaignName: string
): LeadSplit[] {
  const splits: LeadSplit[] = [];

  for (const [groupType, leads] of groupedLeads.entries()) {
    const groupTypeName = getGroupTypeName(groupType);
    const campaignName = `${baseCampaignName} - ${groupTypeName}`;

    splits.push({
      groupType,
      splitNumber: 1,
      leads,
      campaignName,
    });
  }

  return splits;
}

/**
 * Main function to process CSV file and create lead splits
 */
export async function processCSVForBulkUpload(
  filePath: string,
  baseCampaignName: string
): Promise<LeadSplit[]> {
  const rows = await parseCSV(filePath);
  const classifiedLeads = classifyLeads(rows);
  const groupedLeads = groupLeadsByType(classifiedLeads);
  return createLeadSplits(groupedLeads, baseCampaignName);
}
