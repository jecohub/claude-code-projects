import { RATE_LIMITS, CONCURRENCY_LIMITS } from "./config.js";
import { AdvancedRateLimiter } from "./utils/rateLimiter.js";
const DEFAULT_PAGE_SIZE = 200;
const SMARTLEAD_GRAPHQL_URL = "https://fe-gql.smartlead.ai/v1/graphql";
function withTimeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort("timeout"), ms);
    return controller.signal;
}
export class SmartleadClient {
    constructor(config) {
        /**
         * Category ID mapping from Smartlead AI categorization system
         * See: src/campaignUiSettings.ts for category definitions
         */
        this.categoryIdMap = {
            1: "interested",
            2: "meetingRequest",
            3: "notInterested",
            4: "doNotContact",
            5: "informationRequest",
            6: "outOfOffice",
            7: "wrongPerson",
            6826: "automatedResponse",
            18893: "referredToSomeone",
            6858: "futurePipeline",
        };
        this.baseUrl = config.baseUrl.replace(/\/+$/, "");
        this.apiKey = config.apiKey;
        this.timeoutMs = config.requestTimeoutMs;
        this.webAuthToken = config.webAuthToken;
        // Initialize separate rate limiters
        this.campaignRateLimiter = new AdvancedRateLimiter(RATE_LIMITS.CAMPAIGN_OPERATIONS.maxRequests, RATE_LIMITS.CAMPAIGN_OPERATIONS.timeWindowMs);
        this.leadUploadRateLimiter = new AdvancedRateLimiter(RATE_LIMITS.LEAD_UPLOADS.maxRequests, RATE_LIMITS.LEAD_UPLOADS.timeWindowMs);
        this.readRateLimiter = new AdvancedRateLimiter(RATE_LIMITS.READ_OPERATIONS.maxRequests, RATE_LIMITS.READ_OPERATIONS.timeWindowMs);
    }
    async getClientStatus(clientId) {
        const notes = [];
        let partial = false;
        const [totalLeads, uncontactedLeads, pausedCampaigns] = await Promise.all([
            this.safeCountLeads(clientId, undefined).catch((err) => {
                partial = true;
                notes.push(`lead count failed: ${err.message}`);
                return undefined;
            }),
            this.safeCountLeads(clientId, "uncontacted").catch((err) => {
                partial = true;
                notes.push(`uncontacted count failed: ${err.message}`);
                return undefined;
            }),
            this.safeCountCampaigns(clientId, "paused").catch((err) => {
                partial = true;
                notes.push(`paused campaigns count failed: ${err.message}`);
                return undefined;
            }),
        ]);
        if (partial) {
            notes.push("Some metrics are partial; confirm the Smartlead endpoints work with your API key.");
        }
        return {
            clientId,
            totals: {
                leads: totalLeads,
                uncontactedLeads,
                pausedCampaigns,
            },
            meta: {
                partial,
                notes: notes.length ? notes : undefined,
                collectedAt: new Date().toISOString(),
            },
        };
    }
    async getLeadStatusBreakdown(clientId) {
        const notes = [];
        let partial = false;
        try {
            // Get campaigns first
            const campaigns = await this.listCampaigns(clientId, { pageSize: 1000 });
            if (!campaigns.items || campaigns.items.length === 0) {
                return {
                    clientId,
                    totalLeads: 0,
                    statusBreakdown: {},
                    meta: {
                        partial: false,
                        collectedAt: new Date().toISOString(),
                    },
                };
            }
            const statusCounts = {};
            let totalLeadsCount = 0;
            let processedCampaigns = 0;
            // Process campaigns in batches to avoid timeout
            for (const campaign of campaigns.items) {
                const campaignId = campaign?.id;
                if (!campaignId)
                    continue;
                try {
                    const params = new URLSearchParams();
                    const body = await this.getJson(`/campaigns/${campaignId}/leads`, params);
                    const leads = body.leads || body.data || [];
                    // Count statuses
                    for (const lead of leads) {
                        const status = lead?.status || "unknown";
                        statusCounts[status] = (statusCounts[status] || 0) + 1;
                    }
                    // Track total
                    if (body.total_leads !== undefined) {
                        const campaignTotal = typeof body.total_leads === 'string'
                            ? parseInt(body.total_leads, 10)
                            : body.total_leads;
                        totalLeadsCount += campaignTotal;
                    }
                    processedCampaigns++;
                }
                catch (err) {
                    // Skip failing campaigns
                    continue;
                }
            }
            notes.push(`Processed ${processedCampaigns} of ${campaigns.items.length} campaigns`);
            return {
                clientId,
                totalLeads: totalLeadsCount,
                statusBreakdown: statusCounts,
                meta: {
                    partial,
                    notes: notes.length ? notes : undefined,
                    collectedAt: new Date().toISOString(),
                },
            };
        }
        catch (err) {
            partial = true;
            const errorMessage = err instanceof Error ? err.message : String(err);
            notes.push(`Failed to fetch lead breakdown: ${errorMessage}`);
            return {
                clientId,
                totalLeads: 0,
                statusBreakdown: {},
                meta: {
                    partial,
                    notes,
                    collectedAt: new Date().toISOString(),
                },
            };
        }
    }
    async getCampaignAnalytics(campaignId) {
        const body = await this.getJson(`/campaigns/${campaignId}/analytics`, new URLSearchParams());
        return body;
    }
    async getCampaignDetails(campaignId) {
        const body = await this.getJson(`/campaigns/${campaignId}`, new URLSearchParams());
        return body;
    }
    async getCampaignSequences(campaignId) {
        const body = await this.getJson(`/campaigns/${campaignId}/sequences`, new URLSearchParams());
        return Array.isArray(body) ? body : [];
    }
    /**
     * Get all leads from a campaign with PARALLEL pagination
     * Used for duplicate detection before uploading
     */
    async getCampaignLeads(campaignId) {
        try {
            const limit = 100;
            // STEP 1: Fetch first page to get total count
            const params = new URLSearchParams();
            params.set("offset", "0");
            params.set("limit", String(limit));
            const firstPage = await this.getJson(`/campaigns/${campaignId}/leads`, params);
            let leads = [];
            if (Array.isArray(firstPage)) {
                leads = firstPage;
            }
            else if (firstPage.leads && Array.isArray(firstPage.leads)) {
                leads = firstPage.leads;
            }
            else if (firstPage.data && Array.isArray(firstPage.data)) {
                leads = firstPage.data;
            }
            const allLeads = [...leads];
            // If first page has less than limit, we're done
            if (leads.length < limit) {
                return allLeads;
            }
            // STEP 2: Fetch remaining pages in parallel batches
            const concurrency = CONCURRENCY_LIMITS.DUPLICATE_DETECTION;
            let offset = limit;
            let hasMore = true;
            while (hasMore && allLeads.length < 100000) {
                // Safety limit
                // Create batch of concurrent requests
                const requestBatch = [];
                for (let i = 0; i < concurrency && hasMore; i++) {
                    const currentOffset = offset + i * limit;
                    const params = new URLSearchParams();
                    params.set("offset", String(currentOffset));
                    params.set("limit", String(limit));
                    requestBatch.push(this.getJson(`/campaigns/${campaignId}/leads`, params).catch((error) => {
                        // Return empty on error (endpoint might not exist)
                        return { leads: [] };
                    }));
                }
                // Wait for all requests in batch to complete
                const results = await Promise.all(requestBatch);
                // Process results
                let addedInBatch = 0;
                for (const body of results) {
                    let pageLeads = [];
                    if (Array.isArray(body)) {
                        pageLeads = body;
                    }
                    else if (body.leads && Array.isArray(body.leads)) {
                        pageLeads = body.leads;
                    }
                    else if (body.data && Array.isArray(body.data)) {
                        pageLeads = body.data;
                    }
                    if (pageLeads.length > 0) {
                        allLeads.push(...pageLeads);
                        addedInBatch += pageLeads.length;
                    }
                    // If we got less than limit, no more pages after this
                    if (pageLeads.length < limit) {
                        hasMore = false;
                    }
                }
                // If we didn't add any leads in this batch, we're done
                if (addedInBatch === 0) {
                    hasMore = false;
                }
                offset += concurrency * limit;
            }
            if (allLeads.length >= 100000) {
                console.log(`     ⚠️  Reached safety limit of 100k leads`);
            }
            return allLeads;
        }
        catch (error) {
            // If endpoint doesn't exist or errors, return empty array
            return [];
        }
    }
    /**
     * Get lead categorization breakdown for a campaign
     * Fetches all leads and counts by AI category
     */
    async getLeadCategorization(campaignId) {
        const categorization = {
            interested: 0,
            meetingRequest: 0,
            informationRequest: 0,
            notInterested: 0,
            doNotContact: 0,
            outOfOffice: 0,
            wrongPerson: 0,
            automatedResponse: 0,
            referredToSomeone: 0,
            futurePipeline: 0,
            uncategorized: 0,
        };
        try {
            const leads = await this.getCampaignLeads(campaignId);
            for (const leadWrapper of leads) {
                // Lead data structure can be: { lead: {...} } or direct lead object
                const lead = leadWrapper.lead || leadWrapper;
                // Check multiple possible field names for category
                const categoryId = lead.lead_category_id ||
                    lead.category_id ||
                    lead.reply_category_id ||
                    lead.ai_category_id;
                if (categoryId && this.categoryIdMap[categoryId]) {
                    categorization[this.categoryIdMap[categoryId]]++;
                }
                else if (lead.has_replied || lead.replied) {
                    // If lead has replied but no category, count as uncategorized
                    categorization.uncategorized++;
                }
            }
        }
        catch (error) {
            // Return zero counts on error
            console.error(`Error fetching lead categorization for campaign ${campaignId}:`, error);
        }
        return categorization;
    }
    async getCampaignReport(clientId, fromDate) {
        const notes = [];
        let partial = false;
        try {
            // Get all campaigns for this client
            const campaigns = await this.listCampaigns(clientId, { pageSize: 1000 });
            // Filter by date if specified
            let filteredCampaigns = campaigns.items;
            if (fromDate) {
                filteredCampaigns = campaigns.items.filter((campaign) => {
                    const createdAt = new Date(campaign.created_at);
                    return createdAt >= fromDate;
                });
                notes.push(`Filtered to ${filteredCampaigns.length} campaigns from ${fromDate.toISOString()}`);
            }
            if (!filteredCampaigns || filteredCampaigns.length === 0) {
                return {
                    clientId,
                    totalCampaigns: 0,
                    activeCampaigns: 0,
                    pausedCampaigns: 0,
                    campaigns: [],
                    summary: {
                        notStarted: 0,
                        inprogress: 0,
                        completed: 0,
                        blocked: 0,
                        stopped: 0,
                        totalLeads: 0,
                    },
                    activeLeadsSummary: {
                        notStarted: 0,
                        inprogress: 0,
                        blocked: 0,
                        stopped: 0,
                        totalActive: 0,
                    },
                    pausedCampaignDetails: [],
                    meta: {
                        partial: false,
                        collectedAt: new Date().toISOString(),
                    },
                };
            }
            const campaignAnalytics = [];
            const pausedCampaignDetails = [];
            let summaryNotStarted = 0;
            let summaryInprogress = 0;
            let summaryCompleted = 0;
            let summaryBlocked = 0;
            let summaryStopped = 0;
            let summaryTotalLeads = 0;
            let activeCampaigns = 0;
            let pausedCampaigns = 0;
            // Process each campaign
            for (const campaign of filteredCampaigns) {
                const campaignId = campaign.id;
                const campaignName = campaign.name || `Campaign ${campaignId}`;
                const campaignStatus = campaign.status || "UNKNOWN";
                const createdAt = campaign.created_at || new Date().toISOString();
                if (campaignStatus === "ACTIVE")
                    activeCampaigns++;
                if (campaignStatus === "PAUSED")
                    pausedCampaigns++;
                try {
                    // Get analytics data
                    const analytics = await this.getCampaignAnalytics(campaignId);
                    // Get campaign details for configuration
                    const details = await this.getCampaignDetails(campaignId);
                    // Get sequence count
                    const sequences = await this.getCampaignSequences(campaignId);
                    // Helper to parse string or number
                    const parseCount = (val) => {
                        if (val === undefined)
                            return 0;
                        return typeof val === 'string' ? parseInt(val, 10) || 0 : val;
                    };
                    // Build lead counts from campaign_lead_stats
                    const stats = analytics.campaign_lead_stats;
                    const leadCounts = {
                        notStarted: stats?.notStarted || 0,
                        inprogress: stats?.inprogress || 0,
                        completed: stats?.completed || 0,
                        blocked: stats?.blocked || 0,
                        stopped: stats?.stopped || 0,
                        total: stats?.total || 0,
                    };
                    // Build email stats
                    const emailStats = {
                        sent: parseCount(analytics.sent_count),
                        opened: parseCount(analytics.open_count),
                        clicked: parseCount(analytics.click_count),
                        replied: parseCount(analytics.reply_count),
                        bounced: parseCount(analytics.bounce_count),
                    };
                    // Build configuration (if available)
                    const configuration = details ? {
                        senderAccounts: 0, // Not available in basic campaign details
                        maxLeadsPerDay: details.max_leads_per_day || 0,
                        sendingDays: details.scheduler_cron_value?.days || [],
                        scheduleHours: details.scheduler_cron_value
                            ? `${details.scheduler_cron_value.startHour}-${details.scheduler_cron_value.endHour}`
                            : "",
                        sequenceSteps: sequences.length,
                    } : undefined;
                    campaignAnalytics.push({
                        campaignId,
                        campaignName,
                        campaignStatus,
                        createdAt,
                        leadCounts,
                        emailStats,
                        configuration,
                    });
                    // Add to paused campaign details if paused
                    if (campaignStatus === "PAUSED") {
                        pausedCampaignDetails.push({
                            campaignId,
                            campaignName,
                            createdAt,
                            totalLeads: leadCounts.total,
                            notStarted: leadCounts.notStarted,
                            inProgress: leadCounts.inprogress,
                        });
                    }
                    // Add to summary
                    summaryNotStarted += leadCounts.notStarted;
                    summaryInprogress += leadCounts.inprogress;
                    summaryCompleted += leadCounts.completed;
                    summaryBlocked += leadCounts.blocked;
                    summaryStopped += leadCounts.stopped;
                    summaryTotalLeads += leadCounts.total;
                }
                catch (err) {
                    // Skip failing campaigns
                    notes.push(`Failed to process campaign ${campaignId}: ${err}`);
                    continue;
                }
            }
            // Calculate active leads summary (excluding completed)
            const activeLeadsSummary = {
                notStarted: summaryNotStarted,
                inprogress: summaryInprogress,
                blocked: summaryBlocked,
                stopped: summaryStopped,
                totalActive: summaryNotStarted + summaryInprogress + summaryBlocked + summaryStopped,
            };
            return {
                clientId,
                totalCampaigns: filteredCampaigns.length,
                activeCampaigns,
                pausedCampaigns,
                campaigns: campaignAnalytics,
                summary: {
                    notStarted: summaryNotStarted,
                    inprogress: summaryInprogress,
                    completed: summaryCompleted,
                    blocked: summaryBlocked,
                    stopped: summaryStopped,
                    totalLeads: summaryTotalLeads,
                },
                activeLeadsSummary,
                pausedCampaignDetails,
                meta: {
                    partial,
                    notes: notes.length ? notes : undefined,
                    collectedAt: new Date().toISOString(),
                },
            };
        }
        catch (err) {
            partial = true;
            const errorMessage = err instanceof Error ? err.message : String(err);
            notes.push(`Failed to generate campaign report: ${errorMessage}`);
            return {
                clientId,
                totalCampaigns: 0,
                activeCampaigns: 0,
                pausedCampaigns: 0,
                campaigns: [],
                summary: {
                    notStarted: 0,
                    inprogress: 0,
                    completed: 0,
                    blocked: 0,
                    stopped: 0,
                    totalLeads: 0,
                },
                activeLeadsSummary: {
                    notStarted: 0,
                    inprogress: 0,
                    blocked: 0,
                    stopped: 0,
                    totalActive: 0,
                },
                pausedCampaignDetails: [],
                meta: {
                    partial,
                    notes,
                    collectedAt: new Date().toISOString(),
                },
            };
        }
    }
    async safeCountLeads(clientId, status) {
        const result = await this.listLeads(clientId, { status, pageSize: 1 });
        if (result.total !== undefined)
            return result.total;
        if (result.items !== undefined)
            return result.items.length;
        return undefined;
    }
    async safeCountCampaigns(clientId, status) {
        const result = await this.listCampaigns(clientId, { status, pageSize: 1 });
        if (result.total !== undefined)
            return result.total;
        if (result.items !== undefined)
            return result.items.length;
        return undefined;
    }
    async listLeads(clientId, opts = {}) {
        // First, get all campaigns for this client
        const campaigns = await this.listCampaigns(clientId, { pageSize: 1000 });
        if (!campaigns.items || campaigns.items.length === 0) {
            return { items: [], total: 0 };
        }
        // Aggregate leads from all campaigns
        const allLeads = [];
        let totalLeadsCount = 0;
        for (const campaign of campaigns.items) {
            const campaignId = campaign?.id;
            if (!campaignId)
                continue;
            try {
                const params = new URLSearchParams();
                // Smartlead API uses offset/limit or different pagination - try without limit first
                if (opts.page)
                    params.set("offset", String((opts.page - 1) * (opts.pageSize || DEFAULT_PAGE_SIZE)));
                if (opts.status)
                    params.set("status", opts.status);
                const body = await this.getJson(`/campaigns/${campaignId}/leads`, params);
                const leads = body.leads || body.data || [];
                // Filter by status if specified
                const filteredLeads = opts.status
                    ? leads.filter((lead) => lead.status === opts.status)
                    : leads;
                allLeads.push(...filteredLeads);
                // Add to total count (prefer total_leads from API if available)
                if (body.total_leads !== undefined) {
                    const campaignTotal = typeof body.total_leads === 'string'
                        ? parseInt(body.total_leads, 10)
                        : body.total_leads;
                    totalLeadsCount += campaignTotal;
                }
            }
            catch (err) {
                // Skip campaigns that fail, continue with others
                continue;
            }
        }
        return { items: allLeads, total: totalLeadsCount || allLeads.length };
    }
    async listCampaigns(clientId, opts = {}) {
        const params = new URLSearchParams();
        // Smartlead API doesn't accept 'limit' - try without it or use offset
        if (opts.page)
            params.set("offset", String((opts.page - 1) * (opts.pageSize || DEFAULT_PAGE_SIZE)));
        // Try to filter by client_id if the API supports it
        params.set("client_id", clientId);
        // Note: Smartlead API doesn't accept 'status' parameter for campaigns endpoint
        const body = await this.getJson(`/campaigns`, params);
        // Handle both array response and object response
        let items;
        if (Array.isArray(body)) {
            items = body;
        }
        else {
            items = body.campaigns || body.data || [];
        }
        // Filter by client_id and optionally by status client-side
        items = items.filter((campaign) => {
            const campaignClientId = campaign.client_id;
            const matchesClient = campaignClientId === Number(clientId) || campaignClientId === clientId;
            if (opts.status) {
                const campaignStatus = campaign.status;
                return matchesClient && campaignStatus === opts.status;
            }
            return matchesClient;
        });
        const total = !Array.isArray(body) && typeof body.meta?.total === "number"
            ? body.meta.total
            : items.length;
        return { items, total };
    }
    async getJson(path, params) {
        // Apply rate limiting for read operations
        await this.readRateLimiter.throttle();
        const url = this.buildUrl(path, params);
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
            signal: withTimeout(this.timeoutMs),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Smartlead request failed (${response.status}): ${text}`);
        }
        return (await response.json());
    }
    buildUrl(path, params) {
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        const base = this.baseUrl.endsWith("/")
            ? this.baseUrl.slice(0, -1)
            : this.baseUrl;
        const url = new URL(`${base}${normalizedPath}`);
        if (params) {
            params.forEach((value, key) => url.searchParams.set(key, value));
        }
        url.searchParams.set("api_key", this.apiKey);
        return url.toString();
    }
    async postJson(path, body, params, isLeadUpload = false) {
        // Route to appropriate rate limiter based on operation type
        if (isLeadUpload) {
            await this.leadUploadRateLimiter.throttle();
        }
        else {
            await this.campaignRateLimiter.throttle();
        }
        const url = this.buildUrl(path, params);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(body),
                signal: withTimeout(this.timeoutMs),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Smartlead request failed (${response.status}): ${text}`);
            }
            return (await response.json());
        }
        catch (error) {
            if (error instanceof Error) {
                // Add more context to network errors
                if (error.name === 'AbortError' || error.message.includes('timeout')) {
                    throw new Error(`Request timeout after ${this.timeoutMs}ms: ${path}`);
                }
                if (error.message.includes('fetch failed')) {
                    throw new Error(`Network error on ${path}: ${error.message}. Check internet connection or API availability.`);
                }
            }
            throw error;
        }
    }
    // -----------------------------
    // Internal Smartlead GraphQL API
    // -----------------------------
    getGraphqlAuthHeader(tokenOverride) {
        const raw = (tokenOverride || this.webAuthToken || "").trim();
        if (!raw)
            return undefined;
        return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
    }
    async postGraphql(request, tokenOverride) {
        const auth = this.getGraphqlAuthHeader(tokenOverride);
        if (!auth) {
            throw new Error("Missing Smartlead web auth token. Set SMARTLEAD_WEB_AUTH_TOKEN or pass uiAuthToken to enable UI-only settings copy.");
        }
        // Treat GraphQL as a campaign operation for throttling purposes
        await this.campaignRateLimiter.throttle();
        const response = await fetch(SMARTLEAD_GRAPHQL_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: auth,
            },
            body: JSON.stringify(request),
            signal: withTimeout(this.timeoutMs),
        });
        const text = await response.text();
        let envelope;
        try {
            envelope = JSON.parse(text);
        }
        catch {
            // ignore parse error; handled below
        }
        if (!response.ok) {
            const details = envelope?.errors?.length
                ? envelope.errors.map((e) => e.message).join("; ")
                : text;
            throw new Error(`Smartlead GraphQL request failed (${response.status}): ${details}`);
        }
        if (!envelope) {
            throw new Error(`Smartlead GraphQL returned non-JSON response (${response.status}): ${text.slice(0, 500)}`);
        }
        if (envelope.errors?.length) {
            throw new Error(`Smartlead GraphQL errors: ${envelope.errors.map((e) => e.message).join("; ")}`);
        }
        if (!envelope.data) {
            throw new Error("Smartlead GraphQL response missing data");
        }
        return envelope.data;
    }
    /**
     * Apply UI-only settings: fixed config for AI/bounce + copy OOO from source
     * - AI categorization: uses fixed config
     * - Bounce auto-protection: uses fixed config
     * - OOO detection: copied from source campaign
     */
    async applyUiOnlySettingsGraphql(sourceCampaignId, targetCampaignId, tokenOverride) {
        // Import fixed settings from config (AI categorization + bounce protection)
        const { getFixedUiSettings } = await import("./campaignUiSettings.js");
        const fixedSettings = getFixedUiSettings();
        // Fetch OOO settings from source campaign
        const getSettingsQuery = `
      query getCampaignUiOnlySettings($id: Int!) {
        email_campaigns_by_pk(id: $id) {
          out_of_office_detection_settings
        }
      }
    `;
        const settingsData = await this.postGraphql({
            operationName: "getCampaignUiOnlySettings",
            variables: { id: sourceCampaignId },
            query: getSettingsQuery,
        }, tokenOverride);
        const source = settingsData.email_campaigns_by_pk;
        if (!source) {
            return {
                applied: false,
                details: [`Source campaign not found in GraphQL (id=${sourceCampaignId})`],
            };
        }
        // Merge: fixed AI/bounce/domain rate limit + copied OOO
        const changes = {
            ai_categorisation_options: fixedSettings.ai_categorisation_options,
            auto_categorise_reply: fixedSettings.auto_categorise_reply,
            bounce_autopause_threshold: fixedSettings.bounce_autopause_threshold,
            domain_level_rate_limit: fixedSettings.domain_level_rate_limit,
            out_of_office_detection_settings: source.out_of_office_detection_settings ?? null,
        };
        const details = [
            `auto_categorise_reply=${fixedSettings.auto_categorise_reply ? "true" : "false"} (fixed)`,
            `bounce_autopause_threshold=${String(fixedSettings.bounce_autopause_threshold)} (fixed)`,
            `domain_level_rate_limit=${fixedSettings.domain_level_rate_limit ? "true" : "false"} (fixed)`,
            "ai_categorisation_options=applied (fixed)",
            "out_of_office_detection_settings=copied from source",
        ];
        const updateMutation = `
      mutation updateCampaignById($id: Int!, $changes: email_campaigns_set_input!) {
        update_email_campaigns_by_pk(pk_columns: {id: $id}, _set: $changes) {
          id
          __typename
        }
      }
    `;
        await this.postGraphql({
            operationName: "updateCampaignById",
            variables: { id: targetCampaignId, changes },
            query: updateMutation,
        }, tokenOverride);
        return { applied: true, details };
    }
    // Campaign Management Methods
    /**
     * Create a new campaign
     */
    async createCampaign(request) {
        return this.postJson("/campaigns/create", request);
    }
    /**
     * Update campaign general settings
     */
    async updateCampaignSettings(campaignId, settings) {
        await this.postJson(`/campaigns/${campaignId}/settings`, settings);
    }
    /**
     * Update campaign schedule
     */
    async updateCampaignSchedule(campaignId, schedule) {
        await this.postJson(`/campaigns/${campaignId}/schedule`, schedule);
    }
    /**
     * Save campaign sequences
     * Note: API expects { sequences: [...] } wrapper, not a plain array
     */
    async saveCampaignSequences(campaignId, sequences) {
        await this.postJson(`/campaigns/${campaignId}/sequences`, { sequences });
    }
    /**
     * Upload multiple batches in parallel with concurrency control
     */
    async uploadBatchesInParallel(campaignId, batches, isNewCampaign, options) {
        const concurrency = CONCURRENCY_LIMITS.BATCH_UPLOADS;
        const results = {
            totalUploaded: 0,
            totalDuplicates: 0,
            totalInvalid: 0,
            totalUnsubscribed: 0,
            invalidEmails: new Set(),
            unsubscribedLeads: new Set(),
            failedBatches: [],
        };
        // Process batches in chunks of 'concurrency' size
        for (let i = 0; i < batches.length; i += concurrency) {
            const chunk = batches.slice(i, i + concurrency);
            const chunkNumber = Math.floor(i / concurrency) + 1;
            const totalChunks = Math.ceil(batches.length / concurrency);
            // Create array of upload promises
            const uploadPromises = chunk.map(async (batch, chunkIndex) => {
                const batchIndex = i + chunkIndex;
                const batchNumber = batchIndex + 1;
                const request = {
                    lead_list: batch,
                    settings: {
                        ignore_global_block_list: options?.ignoreGlobalBlockList,
                        ignore_unsubscribe_list: options?.ignoreUnsubscribeList,
                        ignore_duplicate_leads_in_other_campaign: options?.ignoreDuplicateLeadsInOtherCampaign,
                    },
                };
                // Retry logic for individual batch
                let retries = 0;
                const maxRetries = 3;
                while (retries < maxRetries) {
                    try {
                        const response = await this.postJson(`/campaigns/${campaignId}/leads`, request, undefined, true);
                        return {
                            success: true,
                            batchNumber,
                            response,
                            batch: null,
                        };
                    }
                    catch (error) {
                        retries++;
                        if (retries < maxRetries) {
                            // Skip delay for new campaigns (no conflict risk)
                            if (!isNewCampaign) {
                                await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
                            }
                        }
                        else {
                            return {
                                success: false,
                                batchNumber,
                                response: null,
                                batch,
                            };
                        }
                    }
                }
                return {
                    success: false,
                    batchNumber,
                    response: null,
                    batch,
                };
            });
            // Wait for all uploads in this chunk to complete
            const chunkResults = await Promise.allSettled(uploadPromises);
            // Process results
            chunkResults.forEach((result) => {
                if (result.status === "fulfilled" &&
                    result.value.success &&
                    result.value.response) {
                    const response = result.value.response;
                    results.totalUploaded += response.upload_count || 0;
                    results.totalDuplicates += response.duplicate_count || 0;
                    results.totalInvalid += response.invalid_email_count || 0;
                    results.totalUnsubscribed += response.unsubscribed_leads?.length || 0;
                    for (const email of response.invalid_emails ?? []) {
                        if (email)
                            results.invalidEmails.add(String(email).toLowerCase());
                    }
                    for (const email of response.unsubscribed_leads ?? []) {
                        if (email)
                            results.unsubscribedLeads.add(String(email).toLowerCase());
                    }
                }
                else if (result.status === "fulfilled" &&
                    !result.value.success &&
                    result.value.batch) {
                    results.failedBatches.push(result.value.batch);
                }
                else if (result.status === "rejected") {
                    // Promise rejected - shouldn't happen with our error handling
                    console.error(`    Batch upload promise rejected unexpectedly`);
                }
            });
            // Progress indicator
            console.log(`    Chunk ${chunkNumber}/${totalChunks}: ${results.totalUploaded} leads uploaded so far`);
        }
        return results;
    }
    /**
     * Add leads to a campaign with batching and rate limiting
     * Automatically splits leads into batches of 100 (API limit)
     */
    async addLeadsToCampaign(campaignId, leads, options) {
        // Step 1: Check existing leads in campaign to avoid duplicates
        console.log(`  🔍 Checking existing leads in campaign ${campaignId}...`);
        let existingLeads = [];
        try {
            existingLeads = await this.getCampaignLeads(campaignId);
            console.log(`     Found ${existingLeads.length} existing leads`);
        }
        catch (error) {
            console.log(`     Could not fetch existing leads, will upload all`);
        }
        // Create set of existing emails for fast lookup
        // API returns leads in format: { lead: { email: "..." } }
        const existingEmails = new Set(existingLeads
            .map((item) => item.lead?.email || item.email)
            .filter((email) => email)
            .map((email) => email.toLowerCase()));
        // Filter out leads that already exist
        const newLeadsRaw = leads.filter((lead) => !existingEmails.has(lead.email.toLowerCase()));
        // De-dupe new leads by email (keeps first occurrence)
        const newLeadsByEmail = new Map();
        for (const lead of newLeadsRaw) {
            const email = lead.email?.toLowerCase().trim();
            if (!email)
                continue;
            if (!newLeadsByEmail.has(email))
                newLeadsByEmail.set(email, lead);
        }
        const newLeads = Array.from(newLeadsByEmail.values());
        const ledgerNewLeadEmails = Array.from(newLeadsByEmail.keys());
        const alreadyUploaded = leads.length - newLeadsRaw.length;
        if (alreadyUploaded > 0) {
            console.log(`     ✓ ${alreadyUploaded} leads already in campaign, skipping`);
        }
        if (newLeads.length === 0) {
            console.log(`  ✓ All leads already uploaded!`);
            return {
                ok: true,
                upload_count: 0,
                total_leads: leads.length,
                block_count: 0,
                duplicate_count: alreadyUploaded,
                invalid_email_count: 0,
                invalid_emails: [],
                already_added_to_campaign: alreadyUploaded,
                unsubscribed_leads: [],
                is_lead_limit_exhausted: false,
                lead_import_stopped_count: 0,
                bounce_count: 0,
                ledger_new_lead_emails: [],
                uploaded_count: 0,
                unsubscribed_count: 0,
            };
        }
        console.log(`  📤 Uploading ${newLeads.length} new leads...`);
        const batchSize = 100;
        const batches = [];
        // Split into batches of 100
        for (let i = 0; i < newLeads.length; i += batchSize) {
            batches.push(newLeads.slice(i, i + batchSize));
        }
        console.log(`     Processing ${batches.length} batches with ${CONCURRENCY_LIMITS.BATCH_UPLOADS}x concurrency`);
        // Upload batches in parallel
        const results = await this.uploadBatchesInParallel(campaignId, batches, existingLeads.length === 0, options);
        // Step 2: Retry failed batches if any
        if (results.failedBatches.length > 0) {
            console.log(`\n  🔄 Retrying ${results.failedBatches.length} failed batches...`);
            const retryResults = await this.uploadBatchesInParallel(campaignId, results.failedBatches, existingLeads.length === 0, options);
            results.totalUploaded += retryResults.totalUploaded;
            results.totalDuplicates += retryResults.totalDuplicates;
            results.totalInvalid += retryResults.totalInvalid;
            results.totalUnsubscribed += retryResults.totalUnsubscribed;
            retryResults.invalidEmails.forEach((e) => results.invalidEmails.add(e));
            retryResults.unsubscribedLeads.forEach((e) => results.unsubscribedLeads.add(e));
            if (retryResults.failedBatches.length > 0) {
                console.error(`     ❌ ${retryResults.failedBatches.length} batches still failed after retry`);
            }
            else {
                console.log(`     ✓ All retries successful`);
            }
        }
        console.log(`  ✓ Upload complete: ${results.totalUploaded}/${newLeads.length} new leads uploaded`);
        if (alreadyUploaded > 0) {
            console.log(`     (${alreadyUploaded} were already in campaign)`);
        }
        return {
            ok: true,
            upload_count: results.totalUploaded,
            total_leads: leads.length,
            block_count: 0,
            duplicate_count: results.totalDuplicates + alreadyUploaded,
            invalid_email_count: results.totalInvalid,
            invalid_emails: Array.from(results.invalidEmails),
            already_added_to_campaign: alreadyUploaded,
            unsubscribed_leads: Array.from(results.unsubscribedLeads),
            is_lead_limit_exhausted: false,
            lead_import_stopped_count: 0,
            bounce_count: 0,
            ledger_new_lead_emails: ledgerNewLeadEmails,
            uploaded_count: results.totalUploaded,
            unsubscribed_count: results.totalUnsubscribed,
        };
    }
    /**
     * Validate source campaign has required data
     */
    async validateSourceCampaign(campaignId) {
        const issues = [];
        const warnings = [];
        try {
            const details = await this.getCampaignDetails(campaignId);
            const sequences = await this.getCampaignSequences(campaignId);
            const hasSettings = !!(details.track_settings ||
                details.stop_lead_settings ||
                details.unsubscribe_text);
            const hasSchedule = !!details.scheduler_cron_value;
            const hasSequences = sequences.length > 0;
            if (!hasSettings) {
                warnings.push('Source campaign has no settings configured');
            }
            if (!hasSchedule) {
                warnings.push('Source campaign has no schedule configured');
            }
            if (!hasSequences) {
                warnings.push('Source campaign has no email sequences');
            }
            return {
                isValid: true,
                hasSettings,
                hasSchedule,
                hasSequences,
                sequenceCount: sequences.length,
                issues,
                warnings,
            };
        }
        catch (error) {
            issues.push(`Failed to access source campaign: ${error instanceof Error ? error.message : String(error)}`);
            return {
                isValid: false,
                hasSettings: false,
                hasSchedule: false,
                hasSequences: false,
                sequenceCount: 0,
                issues,
                warnings,
            };
        }
    }
    /**
     * Verify that settings were actually copied
     */
    async verifyCampaignCopy(sourceCampaignId, newCampaignId, expectedSequences) {
        const details = [];
        try {
            const [sourceDetails, newDetails, newSequences] = await Promise.all([
                this.getCampaignDetails(sourceCampaignId),
                this.getCampaignDetails(newCampaignId),
                this.getCampaignSequences(newCampaignId),
            ]);
            // Check settings (compare array contents, not references)
            const settingsMatch = JSON.stringify(newDetails.track_settings) === JSON.stringify(sourceDetails.track_settings) &&
                JSON.stringify(newDetails.stop_lead_settings) === JSON.stringify(sourceDetails.stop_lead_settings);
            if (!settingsMatch) {
                details.push('Settings do not match source campaign');
            }
            // Check schedule
            const scheduleMatch = !!(newDetails.scheduler_cron_value &&
                sourceDetails.scheduler_cron_value &&
                newDetails.scheduler_cron_value.tz === sourceDetails.scheduler_cron_value.tz);
            if (!scheduleMatch && sourceDetails.scheduler_cron_value) {
                details.push('Schedule does not match source campaign');
            }
            // Check sequences
            const sequenceCountMatch = newSequences.length === expectedSequences;
            if (!sequenceCountMatch) {
                details.push(`Expected ${expectedSequences} sequences, found ${newSequences.length}`);
            }
            const verified = settingsMatch && scheduleMatch && sequenceCountMatch;
            return {
                verified,
                settingsMatch,
                scheduleMatch,
                sequenceCountMatch,
                expectedSequences,
                actualSequences: newSequences.length,
                details: details.length > 0 ? details : undefined,
            };
        }
        catch (error) {
            return {
                verified: false,
                settingsMatch: false,
                scheduleMatch: false,
                sequenceCountMatch: false,
                expectedSequences,
                actualSequences: 0,
                details: [`Verification failed: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }
    /**
     * Retry wrapper for API calls
     */
    async retryOperation(operation, operationName, maxAttempts, delayMs, verbose) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (verbose && attempt > 1) {
                    console.log(`  Retry ${attempt}/${maxAttempts} for ${operationName}...`);
                }
                const result = await operation();
                return { success: true, result };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }
        return {
            success: false,
            error: `${operationName} failed after ${maxAttempts} attempts: ${lastError?.message}`,
        };
    }
    /**
     * Create a duplication step record
     */
    createStep(name, status, startTime, message, error) {
        return {
            name,
            status,
            message,
            error,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    }
    /**
     * Helper to create a failure result
     */
    createFailureResult(sourceCampaignId, campaignName, campaignId, steps, warnings, errors, startTime, startedAt) {
        return {
            success: false,
            campaignId,
            campaignName,
            sourceCampaignId,
            copied: {
                settings: false,
                uiOnlySettings: false,
                schedule: false,
                sequences: false,
            },
            steps,
            warnings,
            errors,
            duration: Date.now() - startTime,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }
    /**
     * Sanitize sequence data for API submission
     * Removes all IDs, timestamps, and metadata that cause validation errors
     * Converts camelCase to snake_case as required by API
     */
    sanitizeSequence(seq) {
        const sanitized = {
            seq_number: seq.seq_number,
            seq_delay_details: {
                delay_in_days: seq.seq_delay_details?.delayInDays || seq.seq_delay_details?.delay_in_days || 1
            },
            subject: seq.subject || "",
            email_body: seq.email_body || "",
        };
        // Handle sequence variants (use snake_case seq_variants for API)
        if (seq.sequence_variants && Array.isArray(seq.sequence_variants)) {
            sanitized.seq_variants = seq.sequence_variants.map((variant) => ({
                subject: variant.subject || "",
                email_body: variant.email_body || "",
                variant_label: variant.variant_label,
                // Only include optional fields if they have non-null values
                ...(variant.optional_email_body_1 != null && {
                    optional_email_body_1: variant.optional_email_body_1
                }),
                ...(variant.variant_distribution_percentage != null && {
                    variant_distribution_percentage: variant.variant_distribution_percentage
                }),
            }));
        }
        // Note: Don't include seq_variants field if null/empty
        return sanitized;
    }
    /**
     * Duplicate a campaign with comprehensive error handling and verification
     *
     * This method creates a new campaign and copies settings, schedule, and sequences
     * from the source campaign. It provides detailed status reporting and optional
     * verification to ensure the copy was successful.
     *
     * @param sourceCampaignId - ID of campaign to duplicate
     * @param newCampaignName - Name for the new campaign
     * @param clientId - Optional client ID (defaults to source campaign's client)
     * @param options - Configuration options for duplication behavior
     * @returns Detailed result object with success status and step-by-step breakdown
     * @throws Error if throwOnError is true and any critical step fails
     */
    async duplicateCampaign(sourceCampaignId, newCampaignName, clientId, options) {
        const startTime = Date.now();
        const startedAt = new Date().toISOString();
        // Apply defaults
        const opts = {
            throwOnError: options?.throwOnError ?? false,
            verifyAfterCopy: options?.verifyAfterCopy ?? true,
            retryAttempts: options?.retryAttempts ?? 2,
            retryDelayMs: options?.retryDelayMs ?? 1000,
            verbose: options?.verbose ?? false,
            skipSequences: options?.skipSequences ?? false,
            skipSchedule: options?.skipSchedule ?? false,
            skipSettings: options?.skipSettings ?? false,
            skipUiOnlySettings: options?.skipUiOnlySettings ?? false,
            uiAuthToken: options?.uiAuthToken ?? this.webAuthToken ?? "",
        };
        const steps = [];
        const warnings = [];
        const errors = [];
        let newCampaignId = -1;
        try {
            // STEP 1: Validate source campaign
            if (opts.verbose) {
                console.log(`\n🔍 Validating source campaign ${sourceCampaignId}...`);
            }
            let stepStart = Date.now();
            const validation = await this.validateSourceCampaign(sourceCampaignId);
            if (!validation.isValid) {
                steps.push(this.createStep('validate_source', 'failed', stepStart, undefined, validation.issues.join('; ')));
                errors.push(...validation.issues);
                if (opts.throwOnError) {
                    throw new Error(`Source campaign validation failed: ${validation.issues.join(', ')}`);
                }
                return this.createFailureResult(sourceCampaignId, newCampaignName, newCampaignId, steps, warnings, errors, startTime, startedAt);
            }
            steps.push(this.createStep('validate_source', 'success', stepStart, `Source campaign validated (${validation.sequenceCount} sequences)`));
            warnings.push(...validation.warnings);
            // STEP 2: Fetch source campaign details
            if (opts.verbose) {
                console.log(`📥 Fetching source campaign details...`);
            }
            stepStart = Date.now();
            const fetchResult = await this.retryOperation(async () => ({
                details: await this.getCampaignDetails(sourceCampaignId),
                sequences: await this.getCampaignSequences(sourceCampaignId),
            }), 'fetch_source_details', opts.retryAttempts, opts.retryDelayMs, opts.verbose);
            if (!fetchResult.success || !fetchResult.result) {
                steps.push(this.createStep('fetch_source', 'failed', stepStart, undefined, fetchResult.error));
                errors.push(fetchResult.error || 'Unknown error fetching source');
                if (opts.throwOnError) {
                    throw new Error(fetchResult.error);
                }
                return this.createFailureResult(sourceCampaignId, newCampaignName, newCampaignId, steps, warnings, errors, startTime, startedAt);
            }
            const { details: sourceDetails, sequences: sourceSequences } = fetchResult.result;
            steps.push(this.createStep('fetch_source', 'success', stepStart, `Fetched ${sourceSequences.length} sequences`));
            // STEP 3: Create new campaign
            if (opts.verbose) {
                console.log(`✨ Creating new campaign "${newCampaignName}"...`);
            }
            stepStart = Date.now();
            const createResult = await this.retryOperation(() => this.createCampaign({
                name: newCampaignName,
                client_id: clientId || String(sourceDetails.client_id) || undefined,
            }), 'create_campaign', opts.retryAttempts, opts.retryDelayMs, opts.verbose);
            if (!createResult.success || !createResult.result) {
                steps.push(this.createStep('create_campaign', 'failed', stepStart, undefined, createResult.error));
                errors.push(createResult.error || 'Unknown error creating campaign');
                if (opts.throwOnError) {
                    throw new Error(createResult.error);
                }
                return this.createFailureResult(sourceCampaignId, newCampaignName, newCampaignId, steps, warnings, errors, startTime, startedAt);
            }
            newCampaignId = createResult.result.id;
            steps.push(this.createStep('create_campaign', 'success', stepStart, `Campaign created with ID ${newCampaignId}`));
            // Track what was successfully copied
            const copied = {
                settings: false,
                uiOnlySettings: false,
                schedule: false,
                sequences: false,
                sequenceCount: 0,
            };
            // STEP 4: Copy settings
            if (!opts.skipSettings) {
                if (opts.verbose) {
                    console.log(`⚙️  Copying campaign settings...`);
                }
                stepStart = Date.now();
                // Convert track_settings from old format to new API format
                let trackSettings = sourceDetails.track_settings;
                if (Array.isArray(trackSettings) && trackSettings.length > 0) {
                    const conversionMap = {
                        'DONT_EMAIL_OPEN': 'DONT_TRACK_EMAIL_OPEN',
                        'DONT_LINK_CLICK': 'DONT_TRACK_LINK_CLICK',
                        'EMAIL_OPEN': '', // Remove - not valid
                        'LINK_CLICK': '', // Remove - not valid
                    };
                    trackSettings = trackSettings
                        .map((val) => {
                        if (typeof val === 'string' && conversionMap.hasOwnProperty(val)) {
                            const converted = conversionMap[val];
                            if (converted) {
                                return converted;
                            }
                            return null; // Mark for removal
                        }
                        return val; // Keep as-is if not in conversion map
                    })
                        .filter((val) => val !== null && val !== ''); // Remove nulls and empty strings
                    if (trackSettings.length === 0) {
                        trackSettings = undefined; // Don't send empty array
                    }
                }
                const settings = {
                    track_settings: trackSettings,
                    stop_lead_settings: sourceDetails.stop_lead_settings,
                    unsubscribe_text: sourceDetails.unsubscribe_text,
                    send_as_plain_text: sourceDetails.send_as_plain_text,
                    follow_up_percentage: sourceDetails.follow_up_percentage,
                    enable_ai_esp_matching: sourceDetails.enable_ai_esp_matching,
                };
                const settingsResult = await this.retryOperation(() => this.updateCampaignSettings(newCampaignId, settings), 'copy_settings', opts.retryAttempts, opts.retryDelayMs, opts.verbose);
                if (settingsResult.success) {
                    copied.settings = true;
                    steps.push(this.createStep('copy_settings', 'success', stepStart, 'Settings copied successfully'));
                }
                else {
                    steps.push(this.createStep('copy_settings', 'failed', stepStart, undefined, settingsResult.error));
                    errors.push(settingsResult.error || 'Unknown error copying settings');
                    if (opts.throwOnError) {
                        throw new Error(settingsResult.error);
                    }
                }
            }
            else {
                steps.push(this.createStep('copy_settings', 'skipped', Date.now(), 'Settings copy skipped by configuration'));
            }
            // STEP 5: Copy schedule
            if (!opts.skipSchedule && sourceDetails.scheduler_cron_value) {
                if (opts.verbose) {
                    console.log(`📅 Copying campaign schedule...`);
                }
                stepStart = Date.now();
                const schedule = {
                    timezone: sourceDetails.scheduler_cron_value.tz,
                    days_of_the_week: sourceDetails.scheduler_cron_value.days,
                    start_hour: sourceDetails.scheduler_cron_value.startHour,
                    end_hour: sourceDetails.scheduler_cron_value.endHour,
                    min_time_btw_emails: sourceDetails.min_time_btwn_emails,
                    max_new_leads_per_day: sourceDetails.max_leads_per_day,
                };
                const scheduleResult = await this.retryOperation(() => this.updateCampaignSchedule(newCampaignId, schedule), 'copy_schedule', opts.retryAttempts, opts.retryDelayMs, opts.verbose);
                if (scheduleResult.success) {
                    copied.schedule = true;
                    steps.push(this.createStep('copy_schedule', 'success', stepStart, 'Schedule copied successfully'));
                }
                else {
                    steps.push(this.createStep('copy_schedule', 'failed', stepStart, undefined, scheduleResult.error));
                    errors.push(scheduleResult.error || 'Unknown error copying schedule');
                    if (opts.throwOnError) {
                        throw new Error(scheduleResult.error);
                    }
                }
            }
            else if (opts.skipSchedule) {
                steps.push(this.createStep('copy_schedule', 'skipped', Date.now(), 'Schedule copy skipped by configuration'));
            }
            else {
                steps.push(this.createStep('copy_schedule', 'skipped', Date.now(), 'No schedule configured in source campaign'));
            }
            // STEP 6: Copy sequences
            if (!opts.skipSequences && sourceSequences.length > 0) {
                if (opts.verbose) {
                    console.log(`📧 Copying ${sourceSequences.length} email sequences...`);
                }
                stepStart = Date.now();
                // Sanitize sequences - remove all IDs, timestamps, and metadata
                const sanitizedSequences = sourceSequences.map(seq => this.sanitizeSequence(seq));
                if (opts.verbose) {
                    console.log(`  Sanitized sequences:`, JSON.stringify(sanitizedSequences, null, 2));
                }
                const sequencesResult = await this.retryOperation(() => this.saveCampaignSequences(newCampaignId, sanitizedSequences), 'copy_sequences', opts.retryAttempts, opts.retryDelayMs, opts.verbose);
                if (sequencesResult.success) {
                    copied.sequences = true;
                    copied.sequenceCount = sourceSequences.length;
                    steps.push(this.createStep('copy_sequences', 'success', stepStart, `Copied ${sourceSequences.length} sequences`));
                }
                else {
                    steps.push(this.createStep('copy_sequences', 'failed', stepStart, undefined, sequencesResult.error));
                    errors.push(sequencesResult.error || 'Unknown error copying sequences');
                    if (opts.throwOnError) {
                        throw new Error(sequencesResult.error);
                    }
                }
            }
            else if (opts.skipSequences) {
                steps.push(this.createStep('copy_sequences', 'skipped', Date.now(), 'Sequences copy skipped by configuration'));
            }
            else {
                steps.push(this.createStep('copy_sequences', 'skipped', Date.now(), 'No sequences configured in source campaign'));
            }
            // STEP 7: Apply UI-only settings (AI/bounce from config, OOO from source)
            {
                const uiStepStart = Date.now();
                if (opts.skipUiOnlySettings) {
                    steps.push(this.createStep('apply_ui_only_settings', 'skipped', uiStepStart, 'UI-only settings application skipped by configuration'));
                }
                else if (!opts.uiAuthToken) {
                    steps.push(this.createStep('apply_ui_only_settings', 'skipped', uiStepStart, 'Missing SMARTLEAD_WEB_AUTH_TOKEN (web auth token not provided)'));
                    warnings.push('UI-only settings (AI categorisation, bounce auto-protection, OOO settings) not applied: missing SMARTLEAD_WEB_AUTH_TOKEN');
                }
                else {
                    if (opts.verbose) {
                        console.log(`🧠 Applying UI-only settings: AI/bounce (fixed) + OOO (from source)...`);
                    }
                    const uiResult = await this.retryOperation(() => this.applyUiOnlySettingsGraphql(sourceCampaignId, newCampaignId, opts.uiAuthToken), 'apply_ui_only_settings', opts.retryAttempts, opts.retryDelayMs, opts.verbose);
                    if (uiResult.success && uiResult.result) {
                        copied.uiOnlySettings = uiResult.result.applied;
                        steps.push(this.createStep('apply_ui_only_settings', uiResult.result.applied ? 'success' : 'skipped', uiStepStart, uiResult.result.details.join('; ')));
                        if (!uiResult.result.applied) {
                            warnings.push(`UI-only settings not applied: ${uiResult.result.details.join('; ')}`);
                        }
                    }
                    else {
                        steps.push(this.createStep('apply_ui_only_settings', 'failed', uiStepStart, undefined, uiResult.error));
                        warnings.push(uiResult.error || 'Unknown error applying UI-only settings');
                        if (opts.throwOnError) {
                            throw new Error(uiResult.error);
                        }
                    }
                }
            }
            // STEP 8: Verify (if enabled)
            let verification;
            if (opts.verifyAfterCopy) {
                if (opts.verbose) {
                    console.log(`✅ Verifying campaign copy...`);
                }
                stepStart = Date.now();
                verification = await this.verifyCampaignCopy(sourceCampaignId, newCampaignId, sourceSequences.length);
                if (verification && verification.verified) {
                    steps.push(this.createStep('verify_copy', 'success', stepStart, 'Campaign copy verified successfully'));
                }
                else {
                    steps.push(this.createStep('verify_copy', 'partial', stepStart, verification?.details?.join('; ')));
                    warnings.push('Verification found discrepancies');
                    if (verification && verification.details) {
                        warnings.push(...verification.details);
                    }
                }
            }
            else {
                steps.push(this.createStep('verify_copy', 'skipped', Date.now(), 'Verification skipped by configuration'));
            }
            // Calculate success
            const success = errors.length === 0 && (!opts.verifyAfterCopy || (verification?.verified === true));
            const completedAt = new Date().toISOString();
            const duration = Date.now() - startTime;
            if (opts.verbose) {
                console.log(`\n${success ? '✅' : '⚠️'} Duplication ${success ? 'completed' : 'completed with issues'} in ${duration}ms`);
            }
            return {
                success,
                campaignId: newCampaignId,
                campaignName: newCampaignName,
                sourceCampaignId,
                copied,
                steps,
                verification,
                warnings,
                errors,
                duration,
                startedAt,
                completedAt,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Fatal error during duplication: ${errorMessage}`);
            return this.createFailureResult(sourceCampaignId, newCampaignName, newCampaignId, steps, warnings, errors, startTime, startedAt);
        }
    }
    /**
     * Get rate limiter statistics for performance monitoring
     */
    getRateLimiterStats() {
        return {
            campaignOps: this.campaignRateLimiter.getStats(),
            leadUploads: this.leadUploadRateLimiter.getStats(),
            readOps: this.readRateLimiter.getStats(),
        };
    }
    /**
     * Reset rate limiter statistics
     */
    resetRateLimiterStats() {
        this.campaignRateLimiter.reset();
        this.leadUploadRateLimiter.reset();
        this.readRateLimiter.reset();
    }
}
