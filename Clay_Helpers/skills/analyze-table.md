# Clay Table Analyzer Skill

## Purpose
Analyze a Clay table's structure, columns, enrichments, and data flow to create comprehensive documentation.

## Input Requirements

The analyzer needs table data in JSON format. Obtain this by:
1. Running the browser extraction script (`scripts/extract-clay-table.js`) in your Clay table
2. Saving the JSON output to `data/tables/<table-name>.json`

## Analysis Output

The analyzer produces a markdown file with:

### 1. Table Overview
- Table name and ID
- URL
- Purpose/use case
- Total columns count
- Data source type

### 2. Column Inventory
For each column:
- Name
- Data type (Text, URL, Number, etc.)
- Input type (Static, Formula, Enrichment)
- Source/Provider (if enrichment)
- Dependencies (which columns feed into it)
- Sample values

### 3. Data Flow Diagram
Visual representation of how data flows through the table:
```
Source → Enrichment A → Formula B → Output
```

### 4. Enrichment Analysis
- List of all enrichment providers used
- Waterfall configurations
- Estimated credit costs per row
- Coverage optimization opportunities

### 5. Formula Audit
- All formulas in the table
- What they transform
- Dependencies they have

### 6. Recommendations
- Missing enrichments that could add value
- Waterfall optimizations
- Formula improvements
- Cost reduction opportunities

## Usage

```bash
# After extracting table data
node scripts/analyze-table.js data/tables/my-table.json
```

## Manual Analysis Guide

If automated extraction doesn't capture all details, manually document:

1. **For each column, note:**
   - Column name
   - Column type (from dropdown)
   - If enrichment: which provider? what inputs?
   - If formula: what's the formula?
   - If waterfall: which providers in what order?
   - Sample output values (3-5 examples)

2. **Identify dependencies:**
   - Which columns are inputs to other columns?
   - What's the order of operations?

3. **Map the workflow:**
   - What triggers the table? (manual, webhook, CRM sync?)
   - What happens to completed rows? (export, write to CRM?)
