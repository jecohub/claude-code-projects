/**
 * Combine all CSV files in a directory into a single CSV file.
 * Deduplicates by domain (first occurrence wins).
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse } from "csv-parse/sync";
function parseArgs() {
    const args = process.argv.slice(2);
    const inputDir = args.find((a) => a.startsWith("--inputDir="))?.split("=")[1] ??
        "/Users/jericodelacruz/Desktop/C17/Swayyem/Storeleads";
    const outputArg = args.find((a) => a.startsWith("--output="))?.split("=")[1];
    const output = outputArg
        ? join(inputDir, outputArg)
        : join(inputDir, "combined.csv");
    const dedupeArg = args.find((a) => a.startsWith("--dedupe="))?.split("=")[1];
    const dedupe = dedupeArg !== "false";
    return { inputDir, output, dedupe };
}
function escapeCsvValue(val) {
    if (val === undefined || val === null)
        return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
function rowsToCsv(rows, header) {
    const lines = [];
    lines.push(header.map(escapeCsvValue).join(","));
    for (const row of rows) {
        const values = header.map((h) => escapeCsvValue(row[h]));
        lines.push(values.join(","));
    }
    return lines.join("\n");
}
async function main() {
    const { inputDir, output, dedupe } = parseArgs();
    console.log(`\n=== COMBINE STORELEADS CSVs ===`);
    console.log(`Input directory: ${inputDir}`);
    console.log(`Output file: ${output}`);
    console.log(`Deduplicate by domain: ${dedupe}\n`);
    const files = readdirSync(inputDir)
        .filter((f) => f.toLowerCase().endsWith(".csv"))
        .sort();
    if (files.length === 0) {
        console.error("No CSV files found in directory.");
        process.exit(1);
    }
    console.log(`Found ${files.length} CSV files.\n`);
    const seenDomains = new Set();
    const allRows = [];
    let header = null;
    let totalRowsRead = 0;
    let duplicatesSkipped = 0;
    for (const file of files) {
        const filePath = join(inputDir, file);
        const content = readFileSync(filePath, "utf-8");
        const records = parse(content, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true,
        });
        totalRowsRead += records.length;
        if (records.length === 0)
            continue;
        if (!header) {
            header = Object.keys(records[0]);
        }
        for (const row of records) {
            const domain = (row.domain ?? "").trim().toLowerCase();
            if (dedupe && domain) {
                if (seenDomains.has(domain)) {
                    duplicatesSkipped++;
                    continue;
                }
                seenDomains.add(domain);
            }
            allRows.push(row);
        }
        console.log(`  ${file}: ${records.length} rows`);
    }
    if (!header || allRows.length === 0) {
        console.error("No data to write.");
        process.exit(1);
    }
    const csv = rowsToCsv(allRows, header);
    writeFileSync(output, csv, "utf-8");
    console.log(`\n=== DONE ===`);
    console.log(`Total rows read: ${totalRowsRead}`);
    if (dedupe) {
        console.log(`Duplicates skipped: ${duplicatesSkipped}`);
    }
    console.log(`Unique rows written: ${allRows.length}`);
    console.log(`Output: ${output}\n`);
}
main().catch((err) => {
    console.error(`Failed: ${err.message}`);
    process.exitCode = 1;
});
