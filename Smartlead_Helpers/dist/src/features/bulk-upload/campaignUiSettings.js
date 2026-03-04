/**
 * Fixed UI-only settings for all campaigns
 * These settings are applied when duplicating campaigns and cannot be set via Smartlead's public API.
 *
 * IMPORTANT: Only AI Categorisation and Bounce Auto-Protection are fixed here.
 * Out of Office detection settings are still COPIED from the source campaign.
 *
 * To customize these settings:
 * 1. Edit the values below to match your desired configuration
 * 2. The settings will be applied automatically to all newly duplicated campaigns
 */
/**
 * AI Lead Categorization Settings
 * Automatically categorizes lead replies using AI
 *
 * Based on screenshot: Do Not Contact, Information Request, Out Of Office,
 * Wrong Person, Interested, Meeting Request, Not Interested,
 * Automated System Response, Referred to Someone Else, Future Pipeline
 */
export const AI_CATEGORISATION_OPTIONS = [
    {
        id: 4,
        label: "Do Not Contact",
        keywords: ["do not contact", "remove", "unsubscribe", "stop"],
        color: "#EF4444" // red
    },
    {
        id: 5,
        label: "Information Request",
        keywords: ["more info", "information", "details", "tell me more"],
        color: "#3B82F6" // blue
    },
    {
        id: 6,
        label: "Out Of Office",
        keywords: ["out of office", "ooo", "vacation", "away"],
        color: "#F59E0B" // orange
    },
    {
        id: 7,
        label: "Wrong Person",
        keywords: ["wrong person", "not me", "incorrect"],
        color: "#6B7280" // gray
    },
    {
        id: 1,
        label: "Interested",
        keywords: ["interested", "yes", "sounds good"],
        color: "#10B981" // green
    },
    {
        id: 2,
        label: "Meeting Request",
        keywords: ["meeting", "schedule", "call", "demo"],
        color: "#8B5CF6" // purple
    },
    {
        id: 3,
        label: "Not Interested",
        keywords: ["not interested", "no thanks", "pass"],
        color: "#DC2626" // dark red
    },
    {
        id: 6826,
        label: "Automated System Response",
        keywords: ["automatic", "auto-reply", "automated"],
        color: "#64748B" // slate
    },
    {
        id: 18893,
        label: "Referred to Someone Else",
        keywords: ["forward", "refer", "colleague", "someone else"],
        color: "#06B6D4" // cyan
    },
    {
        id: 6858,
        label: "Future Pipeline",
        keywords: ["future", "later", "next quarter", "revisit"],
        color: "#F97316" // amber
    }
];
/**
 * Enable automatic reply categorization
 * Set to true to enable AI categorization of replies
 * Corresponds to "Intelli-categorise replies using Smartlead's AI" option
 */
export const AUTO_CATEGORISE_REPLY = true;
/**
 * Bounce Auto-Protection Threshold
 * Automatically pause campaign if bounce rate exceeds this percentage
 * Set to null to disable bounce auto-protection
 *
 * Based on screenshot: Default is 4%
 *
 * Example values:
 * - 4 = pause if bounce rate exceeds 4% (default from screenshot)
 * - 5 = pause if bounce rate exceeds 5%
 * - 10 = pause if bounce rate exceeds 10%
 * - null = disable auto-pause
 */
export const BOUNCE_AUTOPAUSE_THRESHOLD = 4;
/**
 * Domain-Level Rate Limiting
 * Intelligently control sending concurrency for low-volume mailboxes
 * Set to true to enable, false to disable
 *
 * Recommended for mailbox vendors on Outlook/Google that recommend
 * low-volume sending (less than 5 emails per day)
 */
export const DOMAIN_LEVEL_RATE_LIMIT = true;
/**
 * Get fixed UI-only settings (AI categorization + bounce protection + domain rate limiting)
 * OOO settings are NOT included here - they are copied from source campaign
 */
export function getFixedUiSettings() {
    return {
        ai_categorisation_options: AI_CATEGORISATION_OPTIONS,
        auto_categorise_reply: AUTO_CATEGORISE_REPLY,
        bounce_autopause_threshold: BOUNCE_AUTOPAUSE_THRESHOLD,
        domain_level_rate_limit: DOMAIN_LEVEL_RATE_LIMIT,
    };
}
