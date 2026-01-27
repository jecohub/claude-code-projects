import { saveClientMapping } from "./src/utils/mappingStorage.js";

const clientId = "77930";

const mappings = [
  { csvColumn: "FO_FirstName", smartleadField: "first_name" as const },
  { csvColumn: "Last Name", smartleadField: "last_name" as const },
  { csvColumn: "Email", smartleadField: "email" as const },
  { csvColumn: "Company Name", smartleadField: "company_name" as const },
  { csvColumn: "Website", smartleadField: "website" as const },
  { csvColumn: "LinkedIn Profile", smartleadField: "linkedin_profile" as const },
  { csvColumn: "Female?", smartleadField: "custom" as const, customFieldName: "Female" },  // Removed ?
  { csvColumn: "NNiche", smartleadField: "custom" as const, customFieldName: "Niche" },
  { csvColumn: "Full_Name", smartleadField: "custom" as const, customFieldName: "Full_Name" },
  { csvColumn: "Tiktok Account", smartleadField: "custom" as const, customFieldName: "Tiktok_Account" },
  { csvColumn: "NFirst Line", smartleadField: "custom" as const, customFieldName: "First_Line" },
  { csvColumn: "FO_OtherContacts", smartleadField: "custom" as const, customFieldName: "Other_Contacts" },
  { csvColumn: "ESP", smartleadField: "custom" as const, customFieldName: "ESP" },
  { csvColumn: "Provider", smartleadField: "custom" as const, customFieldName: "Provider" },
  { csvColumn: "P.S.", smartleadField: "custom" as const, customFieldName: "PS" },  // Removed periods
];

async function saveMappings() {
  await saveClientMapping(clientId, mappings);
  console.log(`✅ Field mappings saved for Client ${clientId}!`);
  console.log(`Total mappings: ${mappings.length}`);
  console.log("\nMappings:");
  mappings.forEach(m => {
    const field = m.smartleadField === "custom"
      ? `custom (${m.customFieldName})`
      : m.smartleadField;
    console.log(`  ${m.csvColumn} → ${field}`);
  });
}

saveMappings().catch(console.error);
