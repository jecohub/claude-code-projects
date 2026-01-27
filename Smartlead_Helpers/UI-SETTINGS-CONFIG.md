# UI-Only Settings Configuration Guide

## Overview

**AI categorization** and **bounce auto-protection** are now configured as **fixed values** in a configuration file. **Out of Office detection** settings are still **copied from the source campaign**.

This hybrid approach means:

✅ **Consistent AI/bounce settings** across all campaigns (from config file)
✅ **Flexible OOO settings** (copied from source, can vary per campaign)
✅ **Easy to modify** AI/bounce - just edit one file
✅ **Fewer API calls** - only fetch OOO settings from source

## Configuration File

Fixed AI categorization and bounce protection settings are defined in:
```
src/campaignUiSettings.ts
```

## Fixed Settings (Applied to All Campaigns)

### ⚠️ Important Note: "Force plain text as content type"

The **nested checkbox** "Force plain text as content type" (under "Optimise Email Delivery") **cannot be automated** via API or GraphQL. You must check this manually in the Smartlead UI after each campaign creation.

**Why it can't be automated:**
- This field doesn't exist in Smartlead's GraphQL schema
- It's not exposed in the public API
- Extensive testing confirmed it's not accessible programmatically

**After each bulk upload, you'll see a reminder** with direct links to check this setting for each campaign.

---

### 1. Bounce Auto-Protection

Automatically pause campaigns if bounce rate exceeds threshold:

```typescript
export const BOUNCE_AUTOPAUSE_THRESHOLD: number | null = 5;
```

**Options:**
- Set to a number (e.g., `5`) to pause at 5% bounce rate
- Set to `null` to disable bounce auto-protection

**Example values:**
- `3` = Very strict (pause at 3%)
- `5` = Default (pause at 5%)
- `10` = Lenient (pause at 10%)
- `null` = Disabled

---

### 2. AI Lead Categorization

Automatically categorize lead replies using AI:

```typescript
export const AI_CATEGORISATION_OPTIONS = [
  {
    label: "Interested",
    keywords: ["interested", "tell me more", "send info"],
    color: "#10B981" // green
  },
  // ... more categories
];

export const AUTO_CATEGORISE_REPLY = true;
```

**To customize:**
- Add/remove categories
- Modify keywords for each category
- Change colors (hex format)
- Set `AUTO_CATEGORISE_REPLY` to `false` to disable

**Example - Add a custom category:**
```typescript
{
  label: "Hot Lead",
  keywords: ["schedule", "call me", "meeting"],
  color: "#FF6B6B" // bright red
}
```

---

## Copied Settings (From Source Campaign)

### 3. Out of Office Detection

**These settings are COPIED from the source campaign, not fixed.**

When you duplicate a campaign, the OOO detection settings (including checkboxes like "Ignore the auto-categorised OOO reply from the reply %" and "Automatically restart ai-categorised OOO when lead returns") are copied from the source campaign.

**To customize OOO settings:**
- Set them in your source campaign (the one you're duplicating from)
- Or manually configure them in the Smartlead UI after campaign creation

**Why OOO is copied instead of fixed:**
- Different campaigns may need different OOO handling strategies
- Some campaigns may want aggressive follow-up, others conservative
- Flexibility is important for OOO behavior

---

## How to Use

### 1. Edit Settings (One Time)

Open `src/campaignUiSettings.ts` and modify the values to match your needs.

### 2. Apply to Campaigns (Automatic)

Settings are automatically applied when you:
- Duplicate campaigns using `duplicateCampaign()`
- Run bulk upload scripts
- Create campaigns via any automation

**Requirements:**
- `SMARTLEAD_WEB_AUTH_TOKEN` must be set in `.env`
- No other changes needed - it just works!

### 3. Verify Settings

After duplicating a campaign:
1. Open campaign in Smartlead UI
2. Go to Campaign Settings
3. Check that:
   - Bounce protection matches your threshold
   - AI categories are configured
   - OOO detection is enabled (if configured)

---

## Migration from Old Approach

### Before (Copying All from Source):
```typescript
// Made 2 API calls to fetch UI settings
// 1. Fetch AI categorization from source
// 2. Fetch bounce protection from source
// 3. Fetch OOO settings from source
await duplicateCampaign(sourceCampaignId, newCampaignName);
```

### After (Hybrid Approach):
```typescript
// AI/bounce: Applied from config (0 API calls)
// OOO: Copied from source (1 API call)
// Sequences/schedule: Copied from source (existing API calls)
await duplicateCampaign(sourceCampaignId, newCampaignName);
```

**What changed:**
- **AI categorization:** Now fixed in config (no API call)
- **Bounce protection:** Now fixed in config (no API call)
- **OOO settings:** Still copied from source (1 API call, allows flexibility)
- Source campaign still used for sequences, schedule, and OOO settings

---

## Examples

### Example 1: Strict Bounce Protection for Cold Outreach

```typescript
// File: src/campaignUiSettings.ts
export const BOUNCE_AUTOPAUSE_THRESHOLD = 3; // Pause at 3%
```

### Example 2: Custom Categories for Sales Team

```typescript
export const AI_CATEGORISATION_OPTIONS = [
  {
    label: "Hot - Book Meeting",
    keywords: ["schedule", "calendar", "meeting", "demo"],
    color: "#FF0000"
  },
  {
    label: "Warm - Interested",
    keywords: ["interested", "tell me more", "learn more"],
    color: "#FFA500"
  },
  {
    label: "Cold - Not Now",
    keywords: ["not right now", "maybe later", "check back"],
    color: "#0000FF"
  },
  {
    label: "Dead - Not Interested",
    keywords: ["not interested", "no thanks", "remove me"],
    color: "#808080"
  }
];
```

### Example 3: Disable AI Categorization

```typescript
export const AUTO_CATEGORISE_REPLY = false;
export const AI_CATEGORISATION_OPTIONS = []; // Empty array
```

---

## Troubleshooting

### Settings Not Applied

**Problem:** Campaigns don't have UI-only settings after duplication

**Solutions:**
1. Check that `SMARTLEAD_WEB_AUTH_TOKEN` is set in `.env`
2. Verify token is valid (not expired)
3. Check console output for GraphQL errors
4. Ensure `skipUiOnlySettings` is not set to `true`

### How to Get Web Auth Token

1. Log into Smartlead web app
2. Open browser DevTools (F12)
3. Go to Network tab
4. Refresh the page
5. Look for any GraphQL request
6. Copy the `Authorization` header value
7. Add to `.env` as `SMARTLEAD_WEB_AUTH_TOKEN=<token>`

**Note:** Token format can be:
- `Bearer eyJhbGc...` (with Bearer prefix) ✅
- `eyJhbGc...` (without Bearer prefix) ✅

Both formats work - the code handles it automatically.

---

## Benefits

### Before: Copy All from Source Campaign
❌ 3 API calls to fetch all UI settings (AI, bounce, OOO)
❌ AI/bounce settings could vary between campaigns
❌ Had to maintain a "golden" source campaign for all settings
❌ Slower campaign creation

### After: Hybrid Approach (Fixed + Copied)
✅ Only 1 API call (for OOO settings)
✅ Consistent AI/bounce across all campaigns
✅ Flexible OOO per campaign (when needed)
✅ Faster campaign creation (fewer API calls)
✅ Easy to update AI/bounce for all future campaigns

---

## Related Documentation

- **Campaign Settings Reference:** See `CAMPAIGN-SETTINGS-REFERENCE.md`
- **Upload Improvements:** See `UPLOAD-IMPROVEMENTS.md`
- **Environment Variables:** See `.env.example`

---

## Summary

**Fixed Settings (AI Categorization + Bounce Protection):**
1. **Edit once** in `src/campaignUiSettings.ts`
2. **Applied to all campaigns** automatically
3. **No API calls** needed to fetch these settings
4. **Consistent** across all campaigns

**Copied Settings (Out of Office Detection):**
1. **Set in source campaign** before duplicating
2. **Copied automatically** during duplication
3. **1 API call** to fetch OOO settings
4. **Flexible** - can vary per campaign

That's it! Your AI/bounce settings are fixed, OOO is flexible. 🎉
