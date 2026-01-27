# Dev Scripts

Development and testing utilities. These are one-off scripts used during development.

## Folders

### check/
Campaign and lead checking utilities:
- `check-campaign.ts` - Check single campaign details
- `check-created-campaigns.ts` - Verify newly created campaigns
- `check-duplicates.ts` - Check for duplicate leads
- `check-graphql-fields.ts` - Explore GraphQL schema
- `check-lead-count.ts` - Verify lead counts
- `check-plain-text.ts` - Check plain text email settings

### test/
Testing utilities:
- `test-api-calls.ts` - Test raw API calls
- `test-classification.ts` - Test lead classification
- `test-duplicate-detection.ts` - Test duplicate detection
- `test-full-integration.ts` - Full workflow test
- `test-lead-structure.ts` - Test lead data structure
- `test-lead-upload.ts` - Test lead upload
- `test-mapping.ts` - Test field mapping
- `test-minimal.ts` - Minimal test setup
- `test-preview.ts` - Preview upload results
- `test-schedule-api.ts` - Test scheduling API
- `test-sequence-formats.ts` - Test email sequences
- `test-settings-copy.ts` - Test settings copy
- `test-ui-settings.ts` - Test UI settings
- `test-upload.ts` - Test upload workflow
- `test-valid-settings.ts` - Test valid settings

### verify/
Verification utilities:
- `verify-final-campaigns.ts` - Verify final campaign state
- `verify-integration-results.ts` - Verify integration results
- `verify-sequences.ts` - Verify sequence content

### misc/
Other utilities:
- `compare-campaigns.ts` - Compare campaign settings
- `delete-campaigns.ts` - Delete campaigns
- `demo-smart-upload.ts` - Demo smart upload
- `explore-all-fields.ts` - Explore API fields
- `fix-and-test.ts` - Fix and test workflow
- `fix-catchall.ts` - Fix catch-all settings
- `fix-ui-settings-campaigns.ts` - Fix UI settings
- `retry-upload-*.ts` - Retry specific uploads
- `run-bulk-upload.ts` - Run bulk upload
- `save-mapping.ts` - Save field mappings
- `transfer-leads.ts` - Transfer leads
- `try-set-plain-text.ts` - Set plain text mode

## Running Dev Scripts

```bash
npx tsx dev-scripts/check/check-campaign.ts
npx tsx dev-scripts/test/test-api-calls.ts
```
