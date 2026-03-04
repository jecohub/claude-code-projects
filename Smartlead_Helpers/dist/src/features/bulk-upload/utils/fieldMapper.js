/**
 * Maps CSV columns to Smartlead API lead fields
 * Uses intelligent auto-detection based on column names
 */
// Standard field mappings (case-insensitive)
const FIELD_MAPPINGS = {
    email: "email",
    "e-mail": "email",
    "email address": "email",
    first_name: "first_name",
    firstname: "first_name",
    "first name": "first_name",
    fname: "first_name",
    last_name: "last_name",
    lastname: "last_name",
    "last name": "last_name",
    lname: "last_name",
    company: "company_name",
    company_name: "company_name",
    "company name": "company_name",
    organization: "company_name",
    phone: "phone_number",
    phone_number: "phone_number",
    "phone number": "phone_number",
    mobile: "phone_number",
    website: "website",
    url: "website",
    domain: "website",
    "company website": "website",
    location: "location",
    city: "location",
    country: "location",
    address: "location",
    linkedin: "linkedin_profile",
    linkedin_profile: "linkedin_profile",
    "linkedin profile": "linkedin_profile",
    "linkedin url": "linkedin_profile",
    company_url: "company_url",
    "company url": "company_url",
};
/**
 * Detect field type from column name
 */
export function detectFieldType(columnName) {
    const normalized = columnName.toLowerCase().trim();
    const mappedField = FIELD_MAPPINGS[normalized];
    if (mappedField) {
        return mappedField;
    }
    return "custom";
}
/**
 * Generate field mapping preview for CSV columns
 */
export function generateMappingPreview(rows, maxSamples = 3) {
    if (rows.length === 0)
        return [];
    const columns = Object.keys(rows[0]);
    const previews = [];
    for (const column of columns) {
        // No columns are skipped - all are mappable including ESP and Provider
        const detectedField = detectFieldType(column);
        const sampleValues = rows
            .slice(0, maxSamples)
            .map((row) => row[column] || "")
            .filter((val) => val.trim() !== "");
        previews.push({
            csvColumn: column,
            detectedField,
            sampleValues,
        });
    }
    return previews;
}
/**
 * Find value from row using primary column or aliases
 * @param row - CSV row
 * @param mapping - Field mapping with optional aliases
 * @returns Value from the first matching column, or undefined
 */
function findColumnValue(row, mapping) {
    // Try primary column first
    if (row[mapping.csvColumn]) {
        return row[mapping.csvColumn];
    }
    // Try aliases if primary not found
    if (mapping.aliases) {
        for (const alias of mapping.aliases) {
            if (row[alias]) {
                return row[alias];
            }
        }
    }
    return undefined;
}
/**
 * Maps a CSV row to a Smartlead Lead object using saved mappings
 * @param row - CSV row as key-value pairs
 * @param mappings - Optional saved field mappings (if null, uses auto-detection)
 * @returns Lead object with mapped fields
 */
export function mapCSVRowToLead(row, mappings) {
    const lead = {
        email: "",
    };
    const customFields = {};
    if (mappings) {
        // Use saved mappings
        for (const mapping of mappings) {
            const value = findColumnValue(row, mapping);
            if (!value)
                continue;
            if (mapping.smartleadField === "skip") {
                // Intentionally ignored
            }
            else if (mapping.smartleadField === "custom") {
                customFields[mapping.customFieldName || mapping.csvColumn] = value;
            }
            else {
                lead[mapping.smartleadField] = value;
            }
        }
    }
    else {
        // Use auto-detection (fallback)
        for (const [columnName, value] of Object.entries(row)) {
            const normalizedColumn = columnName.toLowerCase().trim();
            const mappedField = FIELD_MAPPINGS[normalizedColumn];
            if (mappedField) {
                // Map to standard field
                lead[mappedField] = value;
            }
            else {
                // Add as custom field (including ESP and Provider)
                customFields[columnName] = value;
            }
        }
    }
    // Add custom fields if any exist
    if (Object.keys(customFields).length > 0) {
        lead.custom_fields = customFields;
    }
    return lead;
}
/**
 * Validates that a lead has a valid email
 * @param lead - Lead object to validate
 * @returns true if lead has a non-empty email
 */
export function validateLead(lead) {
    return !!lead.email && lead.email.trim().length > 0;
}
/**
 * Batch maps multiple CSV rows to Lead objects
 * @param rows - Array of CSV rows
 * @param mappings - Optional saved field mappings
 * @returns Array of Lead objects
 */
export function mapCSVRowsToLeads(rows, mappings) {
    return rows
        .map((row) => mapCSVRowToLead(row, mappings))
        .filter(validateLead);
}
