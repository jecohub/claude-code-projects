/**
 * Clay Table Extractor - Browser Console Script
 * Updated: Works with Clay's actual DOM structure (Tailwind CSS classes)
 *
 * INSTRUCTIONS:
 * 1. Open your Clay table in the browser (make sure you're viewing the table, not workbook)
 * 2. Open DevTools (F12 or Cmd+Shift+I on Mac)
 * 3. Go to the Console tab
 * 4. Paste this entire script and press Enter
 * 5. Right-click the output object and select "Copy object"
 * 6. Save to: data/tables/<table-name>.json
 */

(function extractClayTable() {
  console.log('🔍 Starting Clay table extraction...');

  const result = {
    extractedAt: new Date().toISOString(),
    url: window.location.href,
    tableId: window.location.href.match(/tables\/(t_[^/]+)/)?.[1] || null,
    workbookId: window.location.href.match(/workbooks\/(wb_[^/]+)/)?.[1] || null,
    viewId: window.location.href.match(/views\/(gv_[^/]+)/)?.[1] || null,
    tableName: null,
    columns: [],
    sampleData: [],
    metadata: {
      extractionMethod: 'dom-position',
      headerRowTop: null
    }
  };

  // Clay uses span.block.w-full for column headers at a specific Y position
  // Headers are typically around 130-140px from top
  const headerCandidates = [];

  document.querySelectorAll('span').forEach((el) => {
    const rect = el.getBoundingClientRect();
    const text = el.innerText?.trim();

    // Headers are typically 120-150px from top, short text, no newlines
    if (rect.top > 120 && rect.top < 160 &&
        text && text.length > 0 && text.length < 100 &&
        !text.includes('\n')) {

      // Check if it looks like a header (has block w-full class or similar)
      const isHeaderStyle = el.className.includes('block') ||
                           el.className.includes('w-full') ||
                           el.closest('[class*="header"]');

      if (isHeaderStyle || rect.top > 125) { // fallback to position-based
        headerCandidates.push({
          text: text,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          className: el.className
        });
      }
    }
  });

  // Deduplicate by text and position
  const seen = new Set();
  const uniqueHeaders = headerCandidates.filter(h => {
    const key = `${h.text}-${h.left}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by left position (left to right order)
  uniqueHeaders.sort((a, b) => a.left - b.left);

  // Record the header row position
  if (uniqueHeaders.length > 0) {
    result.metadata.headerRowTop = uniqueHeaders[0].top;
  }

  // Build column list
  uniqueHeaders.forEach((header, index) => {
    result.columns.push({
      index: index,
      name: header.text,
      top: header.top,
      left: header.left
    });
  });

  // Try to extract some sample data (cells below headers)
  // This is tricky because Clay virtualizes rows, but we can try
  const headerTop = result.metadata.headerRowTop || 133;
  const rowHeight = 36; // approximate row height in Clay

  for (let rowNum = 1; rowNum <= 5; rowNum++) {
    const rowTop = headerTop + (rowNum * rowHeight);
    const rowData = {};

    result.columns.forEach((col) => {
      // Look for cells near this position
      const cells = document.elementsFromPoint(col.left + 10, rowTop + 18);
      for (const cell of cells) {
        const text = cell.innerText?.trim();
        if (text && text.length > 0 && text.length < 500 && !text.includes('\n')) {
          rowData[col.name] = text;
          break;
        }
      }
    });

    if (Object.keys(rowData).length > 0) {
      result.sampleData.push(rowData);
    }
  }

  // Output results
  console.log('✅ Extraction complete!');
  console.log(`📊 Found ${result.columns.length} columns`);
  console.log('📋 Columns:', result.columns.map(c => c.name));

  if (result.sampleData.length > 0) {
    console.log(`📝 Captured ${result.sampleData.length} sample rows`);
  }

  console.log('\n🔽 Full result (right-click → Copy object):');
  console.log(result);

  // Try clipboard
  try {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    console.log('📎 JSON copied to clipboard!');
  } catch (e) {
    console.log('⚠️ Could not auto-copy. Right-click the object above → Copy object');
  }

  return result;
})();
