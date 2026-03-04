#!/usr/bin/env npx tsx
/**
 * Campaign Success Analyzer
 *
 * Analyzes all campaigns for a client and ranks them by success metrics.
 * Success is measured using a composite score based on:
 * - Email engagement (sends, opens, clicks)
 * - Positive responses (Interested, Meeting Request, Information Request)
 *
 * Usage:
 *   npx tsx scripts/analyze-campaign-success.ts --clientId=77930
 *   npx tsx scripts/analyze-campaign-success.ts --clientId=77930 --output=./reports/success.json
 *   npx tsx scripts/analyze-campaign-success.ts --clientId=77930 --include-inactive -v
 */
import { getConfig } from "../src/core/config.js";
import { SmartleadClient } from "../src/core/smartleadClient.js";
import * as fs from "fs";
import * as path from "path";
// Default scoring weights (total = 1.0)
const DEFAULT_WEIGHTS = {
    sends: 0.1, // 10% - Volume matters but not too much
    opens: 0.2, // 20% - Opens indicate interest
    clicks: 0.25, // 25% - Clicks show deeper engagement
    positiveResponses: 0.45, // 45% - This is the ultimate goal
};
// Normalization constants for composite score
const NORMALIZATION = {
    maxSent: 10000, // Campaigns with 10k+ sends get max volume score
    openRateMultiplier: 2, // 50% open rate = 100 normalized
    clickRateMultiplier: 10, // 10% click rate = 100 normalized
    positiveRateMultiplier: 20, // 5% positive rate = 100 normalized
};
function parseArgs() {
    const args = process.argv.slice(2);
    const clientId = args.find((a) => a.startsWith("--clientId="))?.split("=")[1] || "77930";
    const outputPath = args.find((a) => a.startsWith("--output="))?.split("=")[1];
    const delayStr = args.find((a) => a.startsWith("--delay="))?.split("=")[1];
    const includeInactive = args.includes("--include-inactive");
    const verbose = args.includes("--verbose") || args.includes("-v");
    const detailed = args.includes("--detailed");
    return {
        clientId,
        outputPath,
        includeInactive,
        verbose,
        detailed,
        delayMs: delayStr ? parseInt(delayStr) : 500, // Default 500ms between campaigns
    };
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function getCampaignUrl(campaignId) {
    return `https://app.smartlead.ai/app/email-campaign/${campaignId}/analytics`;
}
function round(num, decimals = 2) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
function calculateCompositeScore(sent, openRate, clickRate, positiveResponseRate, weights = DEFAULT_WEIGHTS) {
    // Normalize each metric to 0-100
    const normalizedSends = Math.min((sent / NORMALIZATION.maxSent) * 100, 100);
    const normalizedOpens = Math.min(openRate * NORMALIZATION.openRateMultiplier, 100);
    const normalizedClicks = Math.min(clickRate * NORMALIZATION.clickRateMultiplier, 100);
    const normalizedPositive = Math.min(positiveResponseRate * NORMALIZATION.positiveRateMultiplier, 100);
    // Calculate weighted score
    const score = normalizedSends * weights.sends +
        normalizedOpens * weights.opens +
        normalizedClicks * weights.clicks +
        normalizedPositive * weights.positiveResponses;
    return round(score);
}
function buildReport(clientId, campaignMetrics, notes) {
    // Calculate aggregated metrics
    const aggregated = {
        totalSent: 0,
        totalOpens: 0,
        totalClicks: 0,
        totalReplies: 0,
        totalBounces: 0,
        totalPositiveResponses: 0,
        averageOpenRate: 0,
        averageClickRate: 0,
        averageReplyRate: 0,
        averagePositiveResponseRate: 0,
    };
    for (const campaign of campaignMetrics) {
        aggregated.totalSent += campaign.engagement.sent;
        aggregated.totalOpens += campaign.engagement.opens;
        aggregated.totalClicks += campaign.engagement.clicks;
        aggregated.totalReplies += campaign.engagement.replies;
        aggregated.totalBounces += campaign.engagement.bounces;
        aggregated.totalPositiveResponses += campaign.positiveResponses.total;
    }
    // Calculate averages
    if (aggregated.totalSent > 0) {
        aggregated.averageOpenRate = round((aggregated.totalOpens / aggregated.totalSent) * 100);
        aggregated.averageClickRate = round((aggregated.totalClicks / aggregated.totalSent) * 100);
        aggregated.averageReplyRate = round((aggregated.totalReplies / aggregated.totalSent) * 100);
        aggregated.averagePositiveResponseRate = round((aggregated.totalPositiveResponses / aggregated.totalSent) * 100);
    }
    // Get top performers (top 15 in each category)
    const byCompositeScore = [...campaignMetrics]
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, 15);
    const byOpenRate = [...campaignMetrics]
        .filter((c) => c.engagement.sent >= 100) // Only campaigns with meaningful volume
        .sort((a, b) => b.engagement.openRate - a.engagement.openRate)
        .slice(0, 15);
    const byPositiveResponse = [...campaignMetrics]
        .filter((c) => c.engagement.sent >= 100)
        .sort((a, b) => b.positiveResponseRate - a.positiveResponseRate)
        .slice(0, 15);
    return {
        clientId,
        generatedAt: new Date().toISOString(),
        totalCampaigns: campaignMetrics.length,
        aggregated,
        campaigns: campaignMetrics, // Already sorted by composite score
        topPerformers: {
            byCompositeScore,
            byOpenRate,
            byPositiveResponse,
        },
        meta: {
            analysisVersion: "1.0.0",
            scoringWeights: DEFAULT_WEIGHTS,
            notes,
        },
    };
}
async function main() {
    const args = parseArgs();
    const config = getConfig();
    const client = new SmartleadClient(config);
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  CAMPAIGN SUCCESS ANALYZER`);
    console.log(`${"=".repeat(50)}`);
    console.log(`  Client ID: ${args.clientId}`);
    console.log(`  Include Inactive: ${args.includeInactive}`);
    console.log(`  Mode: ${args.detailed ? "DETAILED (fetching all leads)" : "FAST (using analytics only)"}`);
    console.log(`  Delay: ${args.delayMs}ms between campaigns`);
    console.log(`  Started: ${new Date().toISOString()}`);
    console.log(`${"=".repeat(50)}\n`);
    // Step 1: Fetch all campaigns
    console.log("Fetching campaigns...");
    const campaignsResponse = await client.listCampaigns(args.clientId, {
        pageSize: 1000,
    });
    const campaigns = campaignsResponse.items;
    console.log(`Found ${campaigns.length} campaigns\n`);
    // Step 2: Process each campaign
    const campaignMetrics = [];
    const notes = [];
    let processed = 0;
    let skipped = 0;
    for (const campaign of campaigns) {
        const campaignId = campaign.id;
        const campaignName = campaign.name;
        const campaignStatus = campaign.status;
        // Skip inactive unless requested
        if (!args.includeInactive && campaignStatus !== "ACTIVE") {
            skipped++;
            continue;
        }
        processed++;
        if (args.verbose) {
            console.log(`[${processed}/${campaigns.length - skipped}] Processing: ${campaignName} (${campaignId})...`);
        }
        else {
            process.stdout.write(`\rProcessing campaigns: ${processed}/${campaigns.length - skipped}...`);
        }
        try {
            // Get analytics (always needed)
            const analytics = await client.getCampaignAnalytics(campaignId);
            // Calculate metrics from analytics
            const sent = parseInt(String(analytics.sent_count)) || 0;
            const opens = parseInt(String(analytics.open_count)) || 0;
            const clicks = parseInt(String(analytics.click_count)) || 0;
            const replies = parseInt(String(analytics.reply_count)) || 0;
            const bounces = parseInt(String(analytics.bounce_count)) || 0;
            // Calculate rates
            const openRate = sent > 0 ? (opens / sent) * 100 : 0;
            const clickRate = sent > 0 ? (clicks / sent) * 100 : 0;
            const replyRate = sent > 0 ? (replies / sent) * 100 : 0;
            const bounceRate = sent > 0 ? (bounces / sent) * 100 : 0;
            // Get categorization - either from analytics (fast) or by fetching leads (detailed)
            let categorization;
            let positiveResponses;
            if (args.detailed) {
                // DETAILED MODE: Fetch all leads for full categorization breakdown
                categorization = await client.getLeadCategorization(campaignId);
                positiveResponses = {
                    interested: categorization.interested,
                    meetingRequest: categorization.meetingRequest,
                    informationRequest: categorization.informationRequest,
                    total: categorization.interested +
                        categorization.meetingRequest +
                        categorization.informationRequest,
                };
            }
            else {
                // FAST MODE: Use campaign_lead_stats.interested from analytics
                // Note: This only gives us "interested" count, not meeting/info requests
                const interestedCount = analytics.campaign_lead_stats?.interested || 0;
                categorization = {
                    interested: interestedCount,
                    meetingRequest: 0, // Not available in fast mode
                    informationRequest: 0, // Not available in fast mode
                    notInterested: 0,
                    doNotContact: 0,
                    outOfOffice: 0,
                    wrongPerson: 0,
                    automatedResponse: 0,
                    referredToSomeone: 0,
                    futurePipeline: 0,
                    uncategorized: 0,
                };
                positiveResponses = {
                    interested: interestedCount,
                    meetingRequest: 0,
                    informationRequest: 0,
                    total: interestedCount, // In fast mode, only "interested" is tracked
                };
            }
            const positiveResponseRate = sent > 0 ? (positiveResponses.total / sent) * 100 : 0;
            // Calculate composite score
            const compositeScore = calculateCompositeScore(sent, openRate, clickRate, positiveResponseRate);
            const engagement = {
                sent,
                opens,
                clicks,
                replies,
                bounces,
                openRate: round(openRate),
                clickRate: round(clickRate),
                replyRate: round(replyRate),
                bounceRate: round(bounceRate),
            };
            campaignMetrics.push({
                campaignId,
                campaignName,
                campaignStatus,
                campaignUrl: getCampaignUrl(campaignId),
                createdAt: campaign.created_at,
                engagement,
                categorization,
                positiveResponses,
                positiveResponseRate: round(positiveResponseRate),
                compositeScore,
                scoreBreakdown: DEFAULT_WEIGHTS,
            });
            if (args.verbose) {
                console.log(`  -> Score: ${compositeScore}, Interested: ${positiveResponses.interested}, Sent: ${sent}`);
            }
            // Delay between campaigns to avoid rate limiting
            if (args.delayMs > 0) {
                await sleep(args.delayMs);
            }
        }
        catch (error) {
            const msg = `Failed to process campaign ${campaignId}: ${error}`;
            notes.push(msg);
            if (args.verbose) {
                console.error(`  ERROR: ${msg}`);
            }
        }
    }
    if (!args.verbose) {
        console.log(""); // New line after progress
    }
    // Step 3: Sort by composite score
    campaignMetrics.sort((a, b) => b.compositeScore - a.compositeScore);
    // Step 4: Build report
    const report = buildReport(args.clientId, campaignMetrics, notes);
    // Step 5: Output
    const outputPath = args.outputPath ||
        `./reports/campaign-success-${args.clientId}-${Date.now()}.json`;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    // Print summary
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  ANALYSIS COMPLETE`);
    console.log(`${"=".repeat(50)}`);
    console.log(`  Campaigns analyzed: ${campaignMetrics.length}`);
    console.log(`  Campaigns skipped (inactive): ${skipped}`);
    console.log(`  Output saved to: ${outputPath}`);
    console.log(`\n  AGGREGATED METRICS:`);
    console.log(`    Total Sent: ${report.aggregated.totalSent.toLocaleString()}`);
    console.log(`    Total Positive Responses: ${report.aggregated.totalPositiveResponses.toLocaleString()}`);
    console.log(`    Avg Open Rate: ${report.aggregated.averageOpenRate}%`);
    console.log(`    Avg Click Rate: ${report.aggregated.averageClickRate}%`);
    console.log(`    Avg Positive Response Rate: ${report.aggregated.averagePositiveResponseRate}%`);
    console.log(`\n  TOP 15 BY COMPOSITE SCORE:`);
    report.topPerformers.byCompositeScore.forEach((c, i) => {
        console.log(`    ${i + 1}. ${c.campaignName.slice(0, 50)}...`);
        console.log(`       Score: ${c.compositeScore} | Interested: ${c.positiveResponses.interested} | Rate: ${c.positiveResponseRate}%`);
        console.log(`       ${c.campaignUrl}`);
    });
    console.log(`\n  TOP 15 BY POSITIVE RESPONSE RATE:`);
    report.topPerformers.byPositiveResponse.forEach((c, i) => {
        console.log(`    ${i + 1}. ${c.campaignName.slice(0, 50)}...`);
        console.log(`       Rate: ${c.positiveResponseRate}% | Interested: ${c.positiveResponses.interested} | Sent: ${c.engagement.sent}`);
        console.log(`       ${c.campaignUrl}`);
    });
    console.log(`\n${"=".repeat(50)}\n`);
    if (notes.length > 0) {
        console.log(`  NOTES/WARNINGS:`);
        notes.forEach((n) => console.log(`    - ${n}`));
        console.log("");
    }
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
