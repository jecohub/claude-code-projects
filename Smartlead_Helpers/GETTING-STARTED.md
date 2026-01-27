# Smartlead Bulk Upload - Getting Started Guide

## What Is This?

This is a **TypeScript automation script** that helps you upload large CSV files of leads to Smartlead campaigns with automatic campaign duplication, lead classification, and settings management.

For the full end-to-end overview (reporting + bulk upload + cloning internals), see `IMPLEMENTATION_GUIDE.md`.

## Quick Start (3 Steps)

### 1️⃣ Install Dependencies

```bash
npm install
```

### 2️⃣ Configure Your Settings

Copy the example environment file:
```bash
cp .env.example .env
```
If `.env.example` isn’t present, use:
```bash
cp env.example .env
```

Then edit `.env` with your credentials:
```env
SMARTLEAD_API_KEY=your_api_key_here
SMARTLEAD_WEB_AUTH_TOKEN=Bearer your_jwt_token_here
BATCH_UPLOAD_CONCURRENCY=8
SMARTLEAD_TIMEOUT_MS=180000
```

**How to get these:**
- `SMARTLEAD_API_KEY`: From Smartlead Settings → API
- `SMARTLEAD_WEB_AUTH_TOKEN`: Open DevTools in Smartlead → Network tab → Copy Authorization header from any request

### 3️⃣ Customize Campaign Settings (Optional)

Edit `src/campaignUiSettings.ts` to customize:
- AI categorization categories
- Bounce protection threshold (default: 4%)
- Category labels and keywords

### 4️⃣ Prepare Your CSV File

Your CSV should have columns for:
- Email (required)
- First Name
- Last Name
- Company Name
- Any custom fields

### 5️⃣ Update the Script

Edit `run-bulk-upload.ts` with your details:

```typescript
const csvFilePath = "/path/to/your/file.csv";
const sourceCampaignId = 2818135;  // Your template campaign ID
const clientId = "77930";          // Your Smartlead client ID
```

### 6️⃣ Run the Upload

```bash
npx tsx run-bulk-upload.ts
```

That's it! The script will:
1. ✅ Read your CSV file
2. ✅ Classify leads (Outlook/Non-Outlook, Valid/Catchall)
3. ✅ Create campaigns by duplicating your source campaign
4. ✅ Apply all automated settings:
   - AI categorization (10 categories)
   - Bounce protection (4%)
   - Plain text mode
   - OOO detection (copied from source)
   - Sequences & schedule (copied from source)
5. ✅ Upload leads to each campaign
6. ✅ Show you direct links to verify

---

## Advanced Usage

### Run with Different CSV Files

Just update the `csvFilePath` in `run-bulk-upload.ts` and run again.

### Check Campaign Status

```bash
npx tsx scripts/check-all-campaigns.ts
```

### List All Clients

```bash
npx tsx scripts/list-clients.ts
```

### Debug Campaign Settings

```bash
npx tsx scripts/fetch-campaign-settings.ts
```

---

## Performance

### Current Configuration
- **Concurrency**: 8 parallel uploads
- **Batch size**: 100 leads per batch
- **Timeout**: 3 minutes per API call

### Expected Upload Times
- 3,000 leads: ~2-3 minutes
- 10,000 leads: ~5-7 minutes
- 50,000 leads: ~20-30 minutes

### Increase Speed (Optional)

Edit `.env` to increase concurrency:
```env
BATCH_UPLOAD_CONCURRENCY=12  # Instead of 8 (faster but more aggressive)
```

---

## Troubleshooting

### Error: "Missing SMARTLEAD_API_KEY"
- Make sure you created a `.env` file
- Copy your API key from Smartlead Settings

### Error: "Missing SMARTLEAD_WEB_AUTH_TOKEN"
- This is needed for AI categorization and bounce protection
- Get it from browser DevTools → Network → Authorization header

### Error: "Request timeout"
- Increase `SMARTLEAD_TIMEOUT_MS` in `.env`
- Default is 180000 (3 minutes)

### Uploads Are Slow
- Increase `BATCH_UPLOAD_CONCURRENCY` in `.env`
- Current: 8 (safe), Max recommended: 12

### "Field mappings not found"
- First run creates mappings interactively
- Subsequent runs use saved mappings from `.mappings/` folder

---

## File Structure

```
Smartlead_Helpers/
├── src/
│   ├── config.ts                  # Configuration loader
│   ├── smartleadClient.ts         # API client
│   ├── bulkUploadService.ts       # Bulk upload logic
│   ├── csvProcessor.ts            # CSV parsing
│   ├── campaignUiSettings.ts      # Fixed UI settings (EDIT THIS!)
│   └── utils/                     # Helper utilities
│
├── scripts/                       # Utility scripts
│   ├── check-all-campaigns.ts     # Check campaign status
│   ├── list-clients.ts            # List all clients
│   └── fetch-campaign-settings.ts # Debug settings
│
├── .mappings/                     # Saved field mappings
│   └── client-77930.json          # Your saved mappings
│
├── run-bulk-upload.ts             # MAIN SCRIPT (RUN THIS!)
├── .env                           # Your credentials (DO NOT COMMIT!)
├── .env.example                   # Example config
├── package.json                   # Dependencies
└── tsconfig.json                  # TypeScript config
```

---

## What Gets Automated

✅ **Fully Automated:**
- Campaign duplication (sequences, schedule, settings)
- AI categorization (10 categories with custom keywords)
- Bounce protection (4% threshold)
- Plain text mode
- OOO detection settings
- Lead classification (Outlook/Non-Outlook, Valid/Catchall)
- Duplicate detection (skips leads already in campaigns)
- Batch uploads with rate limiting
- Retry logic for failed uploads
- Progress tracking and reporting

❌ **Not Automated (API Limitation):**
- "Force plain text as content type" nested checkbox
  - The parent checkbox IS automated
  - The nested checkbox doesn't exist in Smartlead's API

---

## Security Notes

⚠️ **Important:**
- Never commit `.env` to git (it's in `.gitignore`)
- Your auth token is sensitive - treat it like a password
- Tokens may expire - refresh them periodically

---

## Support & Documentation

- **Campaign Settings Reference**: See `CAMPAIGN-SETTINGS-REFERENCE.md`
- **UI Settings Config**: See `UI-SETTINGS-CONFIG.md`
- **Upload Improvements**: See `UPLOAD-IMPROVEMENTS.md`

---

## Example Output

```
=== SMARTLEAD BULK UPLOAD ===

CSV File: /path/to/file.csv
Source Campaign ID: 2818135
Client ID: 77930

=== PHASE 1: DUPLICATING CAMPAIGNS ===
✓ Campaign 2821710 created for nonoutlook-catchall split 1
✓ Campaign 2821711 created for nonoutlook-catchall split 2

=== PHASE 2: UPLOADING LEADS ===
Uploading 2000 leads to campaign 2821710...
  📤 Uploading 2000 new leads...
  ✓ Upload complete: 2000/2000 new leads uploaded

=== BULK UPLOAD RESULT ===
Status: ✅ SUCCESS

📊 SUMMARY:
  Total Splits: 2
  Campaigns Created: 2
  Leads Processed: 3,211
  Leads Uploaded: 3,211
  Leads Failed: 0

================================================================================
✅ CAMPAIGNS CREATED WITH AUTOMATED SETTINGS
================================================================================

✅ All automated settings applied successfully:
   • AI Categorization - 10 categories
   • Bounce Protection - 4% threshold
   • Plain Text Mode - Enabled
   • OOO Detection - Copied from source
   • Sequences & Schedule - Copied from source
```

---

## Next Steps

1. ✅ Run your first upload
2. ✅ Verify settings in Smartlead UI (use the links in output)
3. ✅ Customize AI categories in `src/campaignUiSettings.ts`
4. ✅ Scale up to larger uploads (10k, 50k+ leads)

Happy uploading! 🚀
