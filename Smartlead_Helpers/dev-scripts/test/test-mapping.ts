import { parseCSV } from "./src/csvProcessor.js";
import { mapCSVRowsToLeads } from "./src/utils/fieldMapper.js";
import { loadClientMapping } from "./src/utils/mappingStorage.js";

const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";
const clientId = "77930";

async function testMapping() {
  console.log("=== FIELD MAPPING TEST ===\n");

  const rows = await parseCSV(csvFilePath);
  console.log(`Total rows: ${rows.length}`);

  const mappings = await loadClientMapping(clientId);
  console.log(`\nLoaded ${mappings?.length} mappings for client ${clientId}`);

  if (!mappings) {
    console.log("ERROR: No mappings found!");
    return;
  }

  console.log("\nSample row (first row):");
  console.log(JSON.stringify(rows[0], null, 2));

  const leads = mapCSVRowsToLeads(rows, mappings);
  console.log(`\nMapped to ${leads.length} valid leads`);

  if (leads.length > 0) {
    console.log("\nFirst lead:");
    console.log(JSON.stringify(leads[0], null, 2));

    console.log("\nSecond lead:");
    console.log(JSON.stringify(leads[1], null, 2));
  } else {
    console.log("\n❌ ERROR: No valid leads after mapping!");
    console.log("\nChecking validation...");

    // Test validation
    const testLead = mapCSVRowsToLeads([rows[0]], mappings);
    console.log("Test lead from first row:", testLead);
  }
}

testMapping().catch(console.error);
