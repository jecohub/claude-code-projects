import { getHealthStatus, getStatusIcon, getTrendIcon, countSendingDays, projectRunOutDate, formatDate, } from './healthCalculator.js';
/**
 * Calculate campaign health metrics for a client's campaigns
 */
export async function calculateCampaignHealth(client, report) {
    const today = new Date();
    const activeCampaigns = report.campaigns.filter(c => c.campaignStatus === 'ACTIVE');
    // Fetch unique active email senders across all active campaigns
    const uniqueSenderIds = new Set();
    for (const campaign of activeCampaigns) {
        const emailAccounts = await client.getCampaignEmailAccounts(campaign.campaignId);
        for (const account of emailAccounts) {
            if (account.is_smtp_success) {
                uniqueSenderIds.add(account.id);
            }
        }
    }
    const activeSenderCount = uniqueSenderIds.size;
    if (activeCampaigns.length === 0) {
        return {
            status: 'Empty',
            statusIcon: '⚪',
            daysRemaining: 0,
            runOutDate: null,
            today,
            remainingLeads: { total: 0, notStarted: 0, inProgress: 0 },
            avgSendRate: 0,
            trend: { direction: 'insufficient_data', percentChange: null, icon: '⏳' },
            emailsRemaining: 0,
            emailsRemainingBreakdown: { notStarted: 0, inProgress: 0, isEstimated: false },
            totalEmailsSent: 0,
            sendingDaysPerWeek: 0,
            campaignStartDate: null,
            activeSenderCount: 0,
            message: 'No active campaigns to analyze',
        };
    }
    const notStarted = report.activeLeadsSummary.notStarted;
    const inProgress = report.activeLeadsSummary.inprogress;
    const remainingLeadsTotal = notStarted + inProgress;
    if (remainingLeadsTotal === 0) {
        const totalSent = activeCampaigns.reduce((sum, c) => sum + c.emailStats.sent, 0);
        return {
            status: 'Empty',
            statusIcon: '⚪',
            daysRemaining: 0,
            runOutDate: null,
            today,
            remainingLeads: { total: 0, notStarted: 0, inProgress: 0 },
            avgSendRate: 0,
            trend: { direction: 'insufficient_data', percentChange: null, icon: '⏳' },
            emailsRemaining: 0,
            emailsRemainingBreakdown: { notStarted: 0, inProgress: 0, isEstimated: false },
            totalEmailsSent: totalSent,
            sendingDaysPerWeek: 0,
            campaignStartDate: null,
            activeSenderCount,
            message: 'All leads have been processed',
        };
    }
    let totalEmailsSent = 0;
    let totalCompleted = 0;
    let earliestCampaignDate = null;
    const allSendingDays = new Set();
    // Track per-campaign data for accurate calculation
    let totalNotStartedEmails = 0;
    let totalInProgressEmails = 0;
    for (const campaign of activeCampaigns) {
        totalEmailsSent += campaign.emailStats.sent;
        totalCompleted += campaign.leadCounts.completed;
        if (campaign.configuration?.sendingDays) {
            campaign.configuration.sendingDays.forEach(d => allSendingDays.add(d));
        }
        const campaignDate = new Date(campaign.createdAt);
        if (!earliestCampaignDate || campaignDate < earliestCampaignDate) {
            earliestCampaignDate = campaignDate;
        }
        const sequenceSteps = campaign.configuration?.sequenceSteps || 3;
        const campaignNotStarted = campaign.leadCounts.notStarted;
        const campaignInProgress = campaign.leadCounts.inprogress;
        const campaignCompleted = campaign.leadCounts.completed;
        const campaignSent = campaign.emailStats.sent;
        // Not Started leads need all sequence steps
        totalNotStartedEmails += campaignNotStarted * sequenceSteps;
        // In Progress leads: estimate remaining based on emails already sent
        // Completed leads received all sequenceSteps emails
        const completedEmails = campaignCompleted * sequenceSteps;
        // Emails sent to In Progress leads = total sent - completed emails
        const inProgressEmailsSent = Math.max(0, campaignSent - completedEmails);
        if (campaignInProgress > 0 && inProgressEmailsSent > 0) {
            // Average emails already sent per In Progress lead
            const avgSentPerInProgress = inProgressEmailsSent / campaignInProgress;
            // Average remaining = sequenceSteps - avgSent (minimum 0)
            const avgRemainingPerInProgress = Math.max(0, sequenceSteps - avgSentPerInProgress);
            totalInProgressEmails += campaignInProgress * avgRemainingPerInProgress;
        }
        else if (campaignInProgress > 0) {
            // No emails sent yet, but leads are "in progress" - assume they need ~half
            totalInProgressEmails += campaignInProgress * Math.ceil(sequenceSteps / 2);
        }
    }
    const totalEmailsRemaining = Math.round(totalNotStartedEmails + totalInProgressEmails);
    const sendingDays = allSendingDays.size > 0 ? Array.from(allSendingDays) : [0, 1, 2, 3, 4, 5, 6];
    const sendingDaysPerWeek = sendingDays.length;
    let avgSendRate = 0;
    if (earliestCampaignDate && totalEmailsSent > 0) {
        const sendingDaysSinceStart = countSendingDays(earliestCampaignDate, today, sendingDays);
        avgSendRate = totalEmailsSent / sendingDaysSinceStart;
    }
    if (totalEmailsSent === 0 || avgSendRate === 0) {
        return {
            status: 'Full',
            statusIcon: '🟢',
            daysRemaining: 999,
            runOutDate: null,
            today,
            remainingLeads: { total: remainingLeadsTotal, notStarted, inProgress },
            avgSendRate: 0,
            trend: { direction: 'insufficient_data', percentChange: null, icon: '⏳' },
            emailsRemaining: totalEmailsRemaining,
            emailsRemainingBreakdown: {
                notStarted: Math.round(totalNotStartedEmails),
                inProgress: Math.round(totalInProgressEmails),
                isEstimated: true,
            },
            totalEmailsSent: 0,
            sendingDaysPerWeek,
            campaignStartDate: earliestCampaignDate,
            activeSenderCount,
            message: 'Not started sending yet',
        };
    }
    const sendingDaysNeeded = Math.ceil(totalEmailsRemaining / avgSendRate);
    const runOutDate = projectRunOutDate(today, sendingDaysNeeded, sendingDays);
    const daysRemaining = Math.ceil((runOutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    let trendDirection = 'insufficient_data';
    let trendPercentChange = null;
    if (earliestCampaignDate) {
        const daysSinceStart = Math.ceil((today.getTime() - earliestCampaignDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceStart >= 14) {
            trendDirection = 'stable';
            trendPercentChange = 0;
        }
    }
    const status = getHealthStatus(daysRemaining, remainingLeadsTotal > 0);
    return {
        status,
        statusIcon: getStatusIcon(status),
        daysRemaining,
        runOutDate,
        today,
        remainingLeads: { total: remainingLeadsTotal, notStarted, inProgress },
        avgSendRate: Math.round(avgSendRate),
        trend: {
            direction: trendDirection,
            percentChange: trendPercentChange,
            icon: getTrendIcon(trendDirection),
        },
        emailsRemaining: totalEmailsRemaining,
        emailsRemainingBreakdown: {
            notStarted: Math.round(totalNotStartedEmails),
            inProgress: Math.round(totalInProgressEmails),
            isEstimated: true, // In Progress is always estimated since API doesn't provide per-sequence data
        },
        totalEmailsSent,
        sendingDaysPerWeek,
        campaignStartDate: earliestCampaignDate,
        activeSenderCount,
    };
}
/**
 * Format campaign health as a text section
 */
export function formatHealthSection(health, clientName, clientId) {
    const lines = [];
    const header = clientName && clientId
        ? `${clientName.toUpperCase()} (${clientId}) CAMPAIGN HEALTH`
        : 'CAMPAIGN HEALTH';
    lines.push('');
    lines.push('================================================================================');
    lines.push(`📊 ${header}`);
    lines.push('================================================================================');
    lines.push('');
    // Handle edge cases with messages
    if (health.message) {
        lines.push(`Status:         ${health.statusIcon} ${health.status}`);
        lines.push(`Message:        ${health.message}`);
        lines.push('');
        lines.push(`Remaining leads:     ${health.remainingLeads.total.toLocaleString()} (Not Started: ${health.remainingLeads.notStarted.toLocaleString()} | In Progress: ${health.remainingLeads.inProgress.toLocaleString()})`);
        if (health.totalEmailsSent > 0) {
            lines.push(`Avg send rate:       ${health.avgSendRate.toLocaleString()} emails/day (historical)`);
        }
        lines.push('');
        lines.push('================================================================================');
        return lines.join('\n');
    }
    // Normal output
    const runOutDateStr = health.runOutDate ? formatDate(health.runOutDate) : 'N/A';
    const todayStr = formatDate(health.today);
    lines.push(`Status:         ${health.statusIcon} ${health.status}`);
    lines.push(`Will run out:   ${runOutDateStr} (${health.daysRemaining} days)`);
    lines.push(`Uncontacted:    ${health.remainingLeads.notStarted.toLocaleString()} leads`);
    lines.push(`Today:          ${todayStr}`);
    lines.push('');
    lines.push(`Remaining leads:     ${health.remainingLeads.total.toLocaleString()} (Not Started: ${health.remainingLeads.notStarted.toLocaleString()} | In Progress: ${health.remainingLeads.inProgress.toLocaleString()})`);
    // Emails remaining breakdown
    const estLabel = health.emailsRemainingBreakdown.isEstimated ? ' (est.)' : '';
    lines.push(`Emails remaining:    ${health.emailsRemaining.toLocaleString()} (Not Started: ${health.emailsRemainingBreakdown.notStarted.toLocaleString()} | In Progress: ${health.emailsRemainingBreakdown.inProgress.toLocaleString()}${estLabel})`);
    lines.push(`Avg send rate:       ${health.avgSendRate.toLocaleString()} emails/day`);
    lines.push(`Active senders:      ${health.activeSenderCount} email account${health.activeSenderCount !== 1 ? 's' : ''}`);
    // Trend
    if (health.trend.direction === 'insufficient_data') {
        lines.push(`Trend:               ${health.trend.icon} Insufficient data`);
    }
    else {
        const changeStr = health.trend.percentChange !== null
            ? (health.trend.percentChange >= 0 ? `+${health.trend.percentChange}%` : `${health.trend.percentChange}%`)
            : '';
        const directionLabel = health.trend.direction.charAt(0).toUpperCase() + health.trend.direction.slice(1);
        lines.push(`Trend:               ${health.trend.icon} ${directionLabel}${changeStr ? ` (${changeStr} vs previous period)` : ''}`);
    }
    lines.push('');
    lines.push('================================================================================');
    return lines.join('\n');
}
