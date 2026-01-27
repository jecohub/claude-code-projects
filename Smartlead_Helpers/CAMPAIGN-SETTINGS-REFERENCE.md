# Campaign Settings Reference

## Overview

This document details which campaign settings are automatically copied during campaign duplication and which settings require manual configuration due to Smartlead API limitations.

## ✅ Automatically Copied Settings

The following settings are automatically replicated when duplicating campaigns using `duplicateCampaign()`:

### Email Delivery Settings

| Setting | API Field | Status |
|---------|-----------|--------|
| Force plain text as content type | `send_as_plain_text` | ✅ Copied |
| Follow-up percentage | `follow_up_percentage` | ✅ Copied |

### Tracking Settings

| Setting | API Field | Status |
|---------|-----------|--------|
| DON'T track email opens | `track_settings: ["DONT_EMAIL_OPEN"]` | ✅ Copied |
| DON'T track link clicks | `track_settings: ["DONT_LINK_CLICK"]` | ✅ Copied |

### AI/Smart Features

| Setting | API Field | Status |
|---------|-----------|--------|
| Enable AI ESP matching | `enable_ai_esp_matching` | ✅ Copied |

### Schedule Settings

| Setting | API Field | Status |
|---------|-----------|--------|
| Timezone | `scheduler_cron_value.tz` | ✅ Copied |
| Days of the week | `scheduler_cron_value.days` | ✅ Copied |
| Start hour | `scheduler_cron_value.startHour` | ✅ Copied |
| End hour | `scheduler_cron_value.endHour` | ✅ Copied |
| Min time between emails | `min_time_btwn_emails` | ✅ Copied |
| Max new leads per day | `max_leads_per_day` | ✅ Copied |

### Campaign Structure

| Setting | API Field | Status |
|---------|-----------|--------|
| Email sequences | Sequences array | ✅ Copied |
| Sequence subjects | `sequences[].subject` | ✅ Copied |
| Sequence bodies | `sequences[].email_body` | ✅ Copied |
| Sequence delays | `sequences[].seq_delay_details` | ✅ Copied |

## ✅ Automatically Applied UI-Only Settings (GraphQL)

The following settings are **NOT available** in the Smartlead public API but are automatically handled during campaign duplication:

### Configuration File: `src/campaignUiSettings.ts`

**Fixed settings** (applied to all campaigns):

#### Bounce Protection (Fixed)
- `BOUNCE_AUTOPAUSE_THRESHOLD`: Set to `4` by default (pause if bounce rate exceeds 4%)
- Can be changed to any number or `null` to disable
- **Consistent across all campaigns**

#### AI Lead Categorization (Fixed)
- `AI_CATEGORISATION_OPTIONS`: 10 predefined categories matching screenshot
- `AUTO_CATEGORISE_REPLY`: Set to `true` to enable automatic categorization
- Customize categories, keywords, and colors in the config file
- **Consistent across all campaigns**

### Copied from Source Campaign

#### Out of Office Detection (Copied)
- **Copied from source campaign** (not fixed)
- Includes all OOO checkboxes and settings
- Allows flexibility per campaign
- Different campaigns can have different OOO handling

### How to Customize These Settings

**Edit the configuration file** at `src/campaignUiSettings.ts`:

```typescript
// Example: Change bounce threshold
export const BOUNCE_AUTOPAUSE_THRESHOLD: number | null = 10; // 10% instead of 4%

// Example: Add/modify AI categories
export const AI_CATEGORISATION_OPTIONS = [
  {
    label: "Hot Lead",
    keywords: ["interested", "let's schedule", "tell me more"],
    color: "#10B981"
  },
  // ... add more categories
];

// Example: Disable AI categorization
export const AUTO_CATEGORISE_REPLY = false;
```

**Changes take effect immediately** for all future campaign duplications. No need to modify API calls or pass settings manually.

**For OOO settings:** Configure them in your source campaign before duplicating, or manually set them in the Smartlead UI after duplication.

### Requirements

To apply these settings automatically, you need:
1. Set `SMARTLEAD_WEB_AUTH_TOKEN` in your `.env` file
2. The token is your Smartlead web JWT token (not the API key)
3. Fixed settings (AI/bounce) are applied from config + OOO copied from source via GraphQL

**Note:** If you don't provide the web auth token, campaigns will still be duplicated successfully, but these UI-only settings will be skipped (you can set them manually in the UI afterward).

**What gets applied:**
- ✅ AI categorization: Fixed from config
- ✅ Bounce protection: Fixed from config
- ✅ OOO detection: Copied from source campaign

## API Limitations Summary

### Settings Available in UI but NOT in Public API

**Fixed settings** (automatically applied from config):
1. **Bounce protection settings** - Fixed in `src/campaignUiSettings.ts`
2. **AI category configurations** - Fixed in `src/campaignUiSettings.ts`

**Copied settings** (automatically copied from source):
3. **OOO detection settings** - Copied from source campaign

All require `SMARTLEAD_WEB_AUTH_TOKEN` to apply via GraphQL.

### Recommended Workflow

**With web auth token (fully automated):**
1. Set `SMARTLEAD_WEB_AUTH_TOKEN` in `.env`
2. Customize AI/bounce in `src/campaignUiSettings.ts` (one-time)
3. Configure OOO in your source campaign (per campaign)
4. Run `duplicateCampaign()` - all settings applied automatically

**Without web auth token (mostly automated):**
1. Run `duplicateCampaign()` - copies all public API settings
2. Manually configure in Smartlead UI:
   - Bounce protection thresholds (or use config defaults)
   - AI category assignments (or use config defaults)
   - OOO detection settings (unique per campaign)

## Technical Details

### Verification Logic

The `duplicateCampaign()` method includes automatic verification to ensure settings are copied correctly:

- **Settings verification**: Compares `track_settings` and `stop_lead_settings` arrays
- **Schedule verification**: Confirms timezone and schedule configuration
- **Sequence verification**: Validates sequence count matches source campaign

### Source Code References

- Campaign duplication: `src/smartleadClient.ts:1314-1812`
- Settings copy: `src/smartleadClient.ts:1495-1592`
- Verification logic: `src/smartleadClient.ts:1125-1190`

## Testing

To verify settings are copied correctly, run:

```bash
npx tsx test-settings-copy.ts
```

This will:
1. Fetch source campaign settings (ID: 2818135)
2. Duplicate the campaign with all settings
3. Verify all available settings match
4. Report any discrepancies

## API Documentation References

For the most up-to-date API capabilities, refer to:
- Smartlead API Docs: https://api.smartlead.ai/docs
- Campaign Settings API: `/api/v1/campaigns/{id}/settings`
- Campaign Schedule API: `/api/v1/campaigns/{id}/schedule`

## Future Considerations

If Smartlead expands their API to include:
- Bounce protection configuration
- AI category management
- Additional deliverability settings

Update the duplication logic in `src/smartleadClient.ts` to include these fields in the settings copy operation.
