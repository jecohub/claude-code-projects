# Bulk Upload

Upload CSV leads to Smartlead campaigns with intelligent splitting and field mapping.

## Entry Points

- **MCP Tool**: `bulkUpload` - Execute complete upload workflow
- **MCP Tool**: `previewCSVMapping` - Preview field mapping before saving
- **MCP Tool**: `saveFieldMapping` - Persist mapping for client

## Files

- `bulkUploadService.ts` - Main orchestration service
- `csvProcessor.ts` - CSV parsing and lead classification
- `campaignUiSettings.ts` - Default UI settings for campaigns
- `utils/fieldMapper.ts` - Auto-detect and map CSV columns
- `utils/mappingStorage.ts` - Persist client mappings to `.mappings/`
- `utils/uploadCheckpoint.ts` - Resume interrupted uploads

## Features

1. **Auto Field Detection** - Detects standard fields (email, first_name, etc.)
2. **Lead Classification** - ESP detection (Outlook), email validity checking
3. **Campaign Splitting** - Splits by ESP type and validation status
4. **Duplicate Prevention** - Checks existing leads before upload
5. **Resume Capability** - Checkpoint system for interrupted uploads
6. **Rate Limiting** - Respects Smartlead API limits

## Workflow

1. Parse CSV
2. Auto-detect field mappings
3. Classify leads (Outlook/Non-Outlook, Valid/CatchAll)
4. Split into groups
5. Duplicate source campaign for each group
6. Upload leads with de-duplication

## Storage

- Field mappings: `.mappings/client-{id}.json`
- Upload checkpoints: `.upload-checkpoints/campaign-{id}.json`
