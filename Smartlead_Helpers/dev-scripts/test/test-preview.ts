import { parseCSV } from "./src/csvProcessor.js";
import { generateMappingPreview } from "./src/utils/fieldMapper.js";
import { hasClientMapping } from "./src/utils/mappingStorage.js";

const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";
const clientId = "77930";

async function testPreview() {
  console.log("=== CSV FIELD MAPPING PREVIEW ===");
  console.log(`File: ${csvFilePath}`);

  const rows = await parseCSV(csvFilePath);
  console.log(`Total Rows: ${rows.length.toLocaleString()}`);

  const hasSaved = await hasClientMapping(clientId);
  console.log(`\nClient ID: ${clientId}`);
  console.log(`Saved Mappings: ${hasSaved ? "YES" : "NO"}`);

  const preview = generateMappingPreview(rows, 3);

  console.log(`\n📋 DETECTED FIELD MAPPINGS:\n`);

  for (const field of preview) {
    const fieldType = field.detectedField === "custom"
      ? `custom (${field.csvColumn})`
      : field.detectedField;

    console.log(`  ${field.csvColumn} → ${fieldType}`);
    if (field.sampleValues.length > 0) {
      console.log(`    Samples: ${field.sampleValues.join(", ")}`);
    }
  }

  console.log(`\nTotal mappable fields: ${preview.length}`);
}

testPreview().catch(console.error);
