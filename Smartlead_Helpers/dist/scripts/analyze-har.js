import * as fs from 'fs';
import * as path from 'path';
function analyzeHAR(harFilePath) {
    console.log(`\n📁 Loading HAR file: ${harFilePath}\n`);
    const harContent = fs.readFileSync(harFilePath, 'utf-8');
    const har = JSON.parse(harContent);
    console.log(`Found ${har.log.entries.length} total network requests\n`);
    console.log('='.repeat(80));
    console.log('SMARTLEAD API CALLS');
    console.log('='.repeat(80));
    // Filter for Smartlead API calls
    const smartleadCalls = har.log.entries.filter(entry => {
        const url = entry.request.url.toLowerCase();
        return url.includes('smartlead.ai') || url.includes('smartlead');
    });
    console.log(`\nFound ${smartleadCalls.length} Smartlead API calls\n`);
    // Look for settings-related calls
    const settingsCalls = smartleadCalls.filter(entry => {
        const url = entry.request.url.toLowerCase();
        return url.includes('setting') ||
            url.includes('bounce') ||
            url.includes('categor') ||
            url.includes('ai') ||
            url.includes('pause') ||
            url.includes('threshold');
    });
    console.log(`\n🎯 POTENTIAL SETTINGS API CALLS (${settingsCalls.length}):\n`);
    settingsCalls.forEach((entry, index) => {
        console.log(`\n[${index + 1}] ${entry.request.method} ${entry.request.url}`);
        console.log(`    Status: ${entry.response.status}`);
        if (entry.request.postData) {
            console.log(`    Payload:`);
            try {
                const payload = JSON.parse(entry.request.postData.text);
                console.log(`    ${JSON.stringify(payload, null, 2).split('\n').join('\n    ')}`);
            }
            catch {
                console.log(`    ${entry.request.postData.text}`);
            }
        }
        if (entry.response.content.text) {
            console.log(`    Response:`);
            try {
                const response = JSON.parse(entry.response.content.text);
                console.log(`    ${JSON.stringify(response, null, 2).split('\n').join('\n    ')}`);
            }
            catch {
                console.log(`    ${entry.response.content.text.substring(0, 200)}...`);
            }
        }
        console.log('-'.repeat(80));
    });
    // Show all Smartlead API endpoints for reference
    console.log(`\n\n📋 ALL SMARTLEAD API ENDPOINTS:\n`);
    const uniqueEndpoints = new Set();
    smartleadCalls.forEach(entry => {
        const url = new URL(entry.request.url);
        const endpoint = `${entry.request.method} ${url.pathname}`;
        uniqueEndpoints.add(endpoint);
    });
    Array.from(uniqueEndpoints).sort().forEach(endpoint => {
        console.log(`  ${endpoint}`);
    });
    console.log(`\n✅ Analysis complete!`);
    console.log(`\nNext steps:`);
    console.log(`1. Review the settings API calls above`);
    console.log(`2. Look for bounce/threshold/category related fields`);
    console.log(`3. Copy the relevant details to scripts/capture-api-calls.md`);
}
// Main execution
const harFile = process.argv[2] || 'smartlead-capture.har';
const harPath = path.resolve(process.cwd(), harFile);
if (!fs.existsSync(harPath)) {
    console.error(`\n❌ Error: HAR file not found at ${harPath}`);
    console.error(`\nUsage: npx tsx scripts/analyze-har.ts [path-to-har-file]`);
    console.error(`\nTo create a HAR file:`);
    console.error(`1. Open Chrome DevTools → Network tab`);
    console.error(`2. Perform the actions in Smartlead (enable bounce protection, etc.)`);
    console.error(`3. Right-click in Network tab → "Save all as HAR with content"`);
    console.error(`4. Save as "smartlead-capture.har" in this project directory`);
    console.error(`5. Run this script again\n`);
    process.exit(1);
}
analyzeHAR(harPath);
