#!/usr/bin/env node

/**
 * Clay Table Analyzer
 *
 * Analyzes extracted Clay table data and generates comprehensive documentation.
 *
 * Usage: node scripts/analyze-table.js <path-to-extracted-json>
 *
 * Input: JSON file from browser extraction script
 * Output: Markdown analysis file in data/tables/
 */

import fs from 'fs';
import path from 'path';

// Column type classification based on common patterns
const ENRICHMENT_PROVIDERS = [
  'apollo', 'clearbit', 'zoominfo', 'lusha', 'hunter', 'snov',
  'dropcontact', 'peopledatalabs', 'pdl', 'cognism', 'seamless',
  'rocketreach', 'contactout', 'kaspr', 'zerobounce', 'neverbounce',
  'kickbox', 'debounce', 'emaillistverify', 'listmint', 'icypeas',
  'prospeo', 'findymail', 'anymail', 'voilanorbert', 'uplead',
  'linkedin', 'crunchbase', 'pitchbook', 'owler', 'builtwith',
  'wappalyzer', 'similarweb', 'hgdata', 'hg insights', 'sumble',
  'claygent', 'use ai', 'ai formula', 'http api'
];

const COLUMN_TYPE_PATTERNS = {
  'enrichment': /enriched?|found|lookup|waterfall/i,
  'formula': /formula|calculated|computed|derived/i,
  'input': /input|source|imported|manual/i,
  'ai': /claygent|ai|gpt|generated/i,
  'waterfall': /waterfall|cascade|fallback/i
};

function analyzeTable(data) {
  const analysis = {
    overview: {},
    columns: [],
    enrichments: [],
    formulas: [],
    waterfalls: [],
    dataFlow: [],
    recommendations: []
  };

  // Overview
  analysis.overview = {
    tableName: data.tableName || 'Unknown Table',
    tableId: data.tableId || 'Unknown',
    url: data.url || '',
    extractedAt: data.extractedAt || new Date().toISOString(),
    totalColumns: data.columns?.length || 0,
    sampleRowCount: data.sampleData?.length || 0
  };

  // Analyze each column
  if (data.columns && Array.isArray(data.columns)) {
    data.columns.forEach((col, index) => {
      const columnAnalysis = {
        index,
        name: col.name || `Column ${index}`,
        type: col.type || inferColumnType(col, data.sampleData, index),
        source: col.source || inferSource(col),
        enrichmentProvider: col.enrichmentProvider || detectProvider(col.name),
        formula: col.formula || null,
        sampleValues: extractSampleValues(data.sampleData, col.name, index),
        dependencies: [],
        isWaterfall: false,
        notes: []
      };

      // Detect if this is part of a waterfall
      if (col.name?.toLowerCase().includes('waterfall') ||
          col.name?.toLowerCase().includes('cascade')) {
        columnAnalysis.isWaterfall = true;
        analysis.waterfalls.push(columnAnalysis.name);
      }

      // Track enrichments
      if (columnAnalysis.enrichmentProvider) {
        analysis.enrichments.push({
          column: columnAnalysis.name,
          provider: columnAnalysis.enrichmentProvider
        });
      }

      // Track formulas
      if (columnAnalysis.formula || columnAnalysis.type === 'formula') {
        analysis.formulas.push({
          column: columnAnalysis.name,
          formula: columnAnalysis.formula || 'Unknown formula'
        });
      }

      analysis.columns.push(columnAnalysis);
    });
  }

  // Generate recommendations
  analysis.recommendations = generateRecommendations(analysis);

  return analysis;
}

function inferColumnType(col, sampleData, index) {
  const name = (col.name || '').toLowerCase();

  // Check for known patterns
  for (const [type, pattern] of Object.entries(COLUMN_TYPE_PATTERNS)) {
    if (pattern.test(name)) return type;
  }

  // Check sample data for type inference
  if (sampleData && sampleData.length > 0) {
    const colName = col.name || `col_${index}`;
    const sampleValue = sampleData[0][colName];

    if (sampleValue) {
      if (typeof sampleValue === 'boolean') return 'checkbox';
      if (typeof sampleValue === 'number') return 'number';
      if (/^https?:\/\//.test(sampleValue)) return 'url';
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sampleValue)) return 'email';
    }
  }

  return 'text';
}

function inferSource(col) {
  if (col.enrichmentProvider) return `Enrichment: ${col.enrichmentProvider}`;
  if (col.formula) return 'Formula';
  return 'Manual/Import';
}

function detectProvider(columnName) {
  if (!columnName) return null;
  const lowerName = columnName.toLowerCase();

  for (const provider of ENRICHMENT_PROVIDERS) {
    if (lowerName.includes(provider.toLowerCase())) {
      return provider;
    }
  }
  return null;
}

function extractSampleValues(sampleData, colName, index) {
  if (!sampleData || !Array.isArray(sampleData)) return [];

  const samples = [];
  const key = colName || `col_${index}`;

  for (let i = 0; i < Math.min(5, sampleData.length); i++) {
    const value = sampleData[i][key];
    if (value !== null && value !== undefined && value !== '') {
      samples.push(value);
    }
  }

  return samples;
}

function generateRecommendations(analysis) {
  const recs = [];

  // Check for missing email waterfall optimization
  const hasEmailColumn = analysis.columns.some(c =>
    c.name?.toLowerCase().includes('email') && !c.isWaterfall
  );
  if (hasEmailColumn && analysis.waterfalls.length === 0) {
    recs.push({
      type: 'optimization',
      priority: 'high',
      message: 'Consider using a waterfall for email enrichment to maximize coverage and minimize costs'
    });
  }

  // Check for potential formula consolidation
  if (analysis.formulas.length > 5) {
    recs.push({
      type: 'optimization',
      priority: 'medium',
      message: `Table has ${analysis.formulas.length} formulas. Consider consolidating related formulas to simplify maintenance.`
    });
  }

  // Check for missing validation
  const hasEmailEnrichment = analysis.enrichments.some(e =>
    e.column?.toLowerCase().includes('email')
  );
  const hasEmailValidation = analysis.enrichments.some(e =>
    ['zerobounce', 'neverbounce', 'kickbox', 'debounce', 'emaillistverify', 'listmint']
      .includes(e.provider?.toLowerCase())
  );
  if (hasEmailEnrichment && !hasEmailValidation) {
    recs.push({
      type: 'quality',
      priority: 'high',
      message: 'Email enrichment detected but no validation provider found. Add email validation to improve deliverability.'
    });
  }

  // General recommendations
  if (analysis.enrichments.length === 0) {
    recs.push({
      type: 'info',
      priority: 'low',
      message: 'No enrichment providers detected. If this table uses enrichments, the extraction may need manual supplementation.'
    });
  }

  return recs;
}

function generateMarkdown(analysis) {
  let md = `# Clay Table Analysis: ${analysis.overview.tableName}\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Source:** ${analysis.overview.url}\n`;
  md += `**Table ID:** ${analysis.overview.tableId}\n\n`;

  // Overview
  md += `## Overview\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Columns | ${analysis.overview.totalColumns} |\n`;
  md += `| Sample Rows Captured | ${analysis.overview.sampleRowCount} |\n`;
  md += `| Enrichment Providers | ${analysis.enrichments.length} |\n`;
  md += `| Formulas | ${analysis.formulas.length} |\n`;
  md += `| Waterfalls | ${analysis.waterfalls.length} |\n\n`;

  // Column Inventory
  md += `## Column Inventory\n\n`;
  md += `| # | Column Name | Type | Source | Provider |\n`;
  md += `|---|-------------|------|--------|----------|\n`;

  analysis.columns.forEach(col => {
    md += `| ${col.index} | ${col.name} | ${col.type} | ${col.source} | ${col.enrichmentProvider || '-'} |\n`;
  });
  md += '\n';

  // Detailed Column Analysis
  md += `## Detailed Column Analysis\n\n`;
  analysis.columns.forEach(col => {
    md += `### ${col.index}. ${col.name}\n\n`;
    md += `- **Type:** ${col.type}\n`;
    md += `- **Source:** ${col.source}\n`;
    if (col.enrichmentProvider) {
      md += `- **Provider:** ${col.enrichmentProvider}\n`;
    }
    if (col.formula) {
      md += `- **Formula:** \`${col.formula}\`\n`;
    }
    if (col.sampleValues.length > 0) {
      md += `- **Sample Values:**\n`;
      col.sampleValues.slice(0, 3).forEach(v => {
        md += `  - \`${String(v).substring(0, 100)}\`\n`;
      });
    }
    if (col.isWaterfall) {
      md += `- **Note:** Part of waterfall configuration\n`;
    }
    md += '\n';
  });

  // Enrichments
  if (analysis.enrichments.length > 0) {
    md += `## Enrichment Providers Used\n\n`;
    analysis.enrichments.forEach(e => {
      md += `- **${e.provider}** → ${e.column}\n`;
    });
    md += '\n';
  }

  // Formulas
  if (analysis.formulas.length > 0) {
    md += `## Formulas\n\n`;
    analysis.formulas.forEach(f => {
      md += `- **${f.column}:** ${f.formula}\n`;
    });
    md += '\n';
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    md += `## Recommendations\n\n`;
    analysis.recommendations.forEach(rec => {
      const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🔵';
      md += `${emoji} **[${rec.type.toUpperCase()}]** ${rec.message}\n\n`;
    });
  }

  // Manual Documentation Section
  md += `## Manual Documentation (Fill In)\n\n`;
  md += `### Table Purpose\n`;
  md += `_Describe what this table is used for:_\n\n`;
  md += `### Data Source\n`;
  md += `_How does data enter this table? (Webhook, CRM sync, CSV import, etc.):_\n\n`;
  md += `### Output/Destination\n`;
  md += `_Where does the processed data go? (CRM, Slack, email sequence, etc.):_\n\n`;
  md += `### Column Notes\n`;
  md += `_Add any additional context about specific columns:_\n\n`;

  analysis.columns.forEach(col => {
    md += `- **${col.name}:** \n`;
  });

  return md;
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node scripts/analyze-table.js <path-to-extracted-json>');
  console.log('');
  console.log('Example: node scripts/analyze-table.js data/tables/my-table.json');
  process.exit(1);
}

const inputPath = args[0];

if (!fs.existsSync(inputPath)) {
  console.error(`Error: File not found: ${inputPath}`);
  process.exit(1);
}

try {
  const rawData = fs.readFileSync(inputPath, 'utf8');
  const tableData = JSON.parse(rawData);

  console.log('Analyzing table...');
  const analysis = analyzeTable(tableData);

  console.log('Generating markdown...');
  const markdown = generateMarkdown(analysis);

  // Determine output path
  const baseName = path.basename(inputPath, '.json');
  const outputPath = path.join(path.dirname(inputPath), `${baseName}-analysis.md`);

  fs.writeFileSync(outputPath, markdown);
  console.log(`Analysis saved to: ${outputPath}`);

  // Also output to console
  console.log('\n--- Analysis Summary ---');
  console.log(`Table: ${analysis.overview.tableName}`);
  console.log(`Columns: ${analysis.overview.totalColumns}`);
  console.log(`Enrichments: ${analysis.enrichments.length}`);
  console.log(`Formulas: ${analysis.formulas.length}`);
  console.log(`Recommendations: ${analysis.recommendations.length}`);

} catch (error) {
  console.error('Error analyzing table:', error.message);
  process.exit(1);
}
