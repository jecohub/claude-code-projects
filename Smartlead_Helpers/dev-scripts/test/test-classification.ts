import { parseCSV, classifyLeads, groupLeadsByType } from "./src/csvProcessor.js";

const csvFilePath = "/Users/jericodelacruz/Desktop/C17/Sohva/December 19/test/C17 - Sohva Social - MenxWomen - Dec 19, 2025 - .csv";

async function testClassification() {
  console.log("=== LEAD CLASSIFICATION TEST ===\n");

  const rows = await parseCSV(csvFilePath);
  console.log(`Total rows: ${rows.length.toLocaleString()}`);

  // Check first few rows
  console.log("\nFirst 3 rows classification:");
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const row = rows[i];
    console.log(`\nRow ${i + 1}:`);
    console.log(`  Email: ${row.Email}`);
    console.log(`  ESP: ${row.ESP}`);
    console.log(`  Provider: ${row.Provider}`);
  }

  // Classify all leads
  const classifiedLeads = classifyLeads(rows);
  const grouped = groupLeadsByType(classifiedLeads);

  console.log("\n=== CLASSIFICATION RESULTS ===\n");

  for (const [groupType, leads] of grouped.entries()) {
    console.log(`${groupType}: ${leads.length.toLocaleString()} leads`);
  }

  const total = Array.from(grouped.values()).reduce((sum, leads) => sum + leads.length, 0);
  console.log(`\nTotal classified: ${total.toLocaleString()}`);

  // Calculate splits needed (2000 max per split)
  console.log("\n=== CAMPAIGN SPLITS NEEDED ===\n");
  let totalSplits = 0;
  for (const [groupType, leads] of grouped.entries()) {
    const splits = Math.ceil(leads.length / 2000);
    totalSplits += splits;
    console.log(`${groupType}: ${splits} campaign(s)`);
    if (splits > 1) {
      for (let i = 0; i < splits; i++) {
        const start = i * 2000;
        const end = Math.min((i + 1) * 2000, leads.length);
        const count = end - start;
        console.log(`  - Split ${i + 1}: ${count} leads`);
      }
    }
  }

  console.log(`\nTotal campaigns to create: ${totalSplits}`);
}

testClassification().catch(console.error);
