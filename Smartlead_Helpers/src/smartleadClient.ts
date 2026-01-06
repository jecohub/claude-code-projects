import { SmartleadConfig } from "./config.js";
import {
  CampaignResponsePage,
  ClientStatusSnapshot,
  LeadResponsePage,
  LeadStatusBreakdown,
  CampaignAnalytics,
  ClientCampaignReport,
  CampaignAnalyticsResponse,
  CampaignDetailsResponse,
  CampaignSequenceResponse,
  PausedCampaignDetail,
} from "./types.js";

const DEFAULT_PAGE_SIZE = 200;

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort("timeout"), ms);
  return controller.signal;
}

export class SmartleadClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: SmartleadConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.requestTimeoutMs;
  }

  async getClientStatus(clientId: string): Promise<ClientStatusSnapshot> {
    const notes: string[] = [];
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
      notes.push(
        "Some metrics are partial; confirm the Smartlead endpoints work with your API key.",
      );
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

  async getLeadStatusBreakdown(clientId: string): Promise<LeadStatusBreakdown> {
    const notes: string[] = [];
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

      const statusCounts: Record<string, number> = {};
      let totalLeadsCount = 0;
      let processedCampaigns = 0;

      // Process campaigns in batches to avoid timeout
      for (const campaign of campaigns.items) {
        const campaignId = (campaign as { id?: number })?.id;
        if (!campaignId) continue;

        try {
          const params = new URLSearchParams();
          const body = await this.getJson<LeadResponsePage>(
            `/campaigns/${campaignId}/leads`,
            params,
          );

          const leads = (body.leads as unknown[]) || (body.data as unknown[]) || [];

          // Count statuses
          for (const lead of leads) {
            const status = (lead as { status?: string })?.status || "unknown";
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
        } catch (err) {
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
    } catch (err) {
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

  async getCampaignAnalytics(campaignId: number): Promise<CampaignAnalyticsResponse> {
    const body = await this.getJson<CampaignAnalyticsResponse>(
      `/campaigns/${campaignId}/analytics`,
      new URLSearchParams(),
    );
    return body;
  }

  async getCampaignDetails(campaignId: number): Promise<CampaignDetailsResponse> {
    const body = await this.getJson<CampaignDetailsResponse>(
      `/campaigns/${campaignId}`,
      new URLSearchParams(),
    );
    return body;
  }

  async getCampaignSequences(campaignId: number): Promise<CampaignSequenceResponse[]> {
    const body = await this.getJson<CampaignSequenceResponse[] | unknown>(
      `/campaigns/${campaignId}/sequences`,
      new URLSearchParams(),
    );
    return Array.isArray(body) ? body : [];
  }

  async getCampaignReport(
    clientId: string,
    fromDate?: Date,
  ): Promise<ClientCampaignReport> {
    const notes: string[] = [];
    let partial = false;

    try {
      // Get all campaigns for this client
      const campaigns = await this.listCampaigns(clientId, { pageSize: 1000 });

      // Filter by date if specified
      let filteredCampaigns = campaigns.items;
      if (fromDate) {
        filteredCampaigns = campaigns.items.filter((campaign: any) => {
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

      const campaignAnalytics: CampaignAnalytics[] = [];
      const pausedCampaignDetails: PausedCampaignDetail[] = [];
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
        const campaignId = (campaign as any).id;
        const campaignName = (campaign as any).name || `Campaign ${campaignId}`;
        const campaignStatus = (campaign as any).status || "UNKNOWN";
        const createdAt = (campaign as any).created_at || new Date().toISOString();

        if (campaignStatus === "ACTIVE") activeCampaigns++;
        if (campaignStatus === "PAUSED") pausedCampaigns++;

        try {
          // Get analytics data
          const analytics = await this.getCampaignAnalytics(campaignId);

          // Get campaign details for configuration
          const details = await this.getCampaignDetails(campaignId);

          // Get sequence count
          const sequences = await this.getCampaignSequences(campaignId);

          // Helper to parse string or number
          const parseCount = (val: string | number | undefined): number => {
            if (val === undefined) return 0;
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
        } catch (err) {
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
    } catch (err) {
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

  private async safeCountLeads(
    clientId: string,
    status?: string,
  ): Promise<number | undefined> {
    const result = await this.listLeads(clientId, { status, pageSize: 1 });
    if (result.total !== undefined) return result.total;
    if (result.items !== undefined) return result.items.length;
    return undefined;
  }

  private async safeCountCampaigns(
    clientId: string,
    status?: string,
  ): Promise<number | undefined> {
    const result = await this.listCampaigns(clientId, { status, pageSize: 1 });
    if (result.total !== undefined) return result.total;
    if (result.items !== undefined) return result.items.length;
    return undefined;
  }

  async listLeads(
    clientId: string,
    opts: { status?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ items: unknown[]; total?: number }> {
    // First, get all campaigns for this client
    const campaigns = await this.listCampaigns(clientId, { pageSize: 1000 });
    if (!campaigns.items || campaigns.items.length === 0) {
      return { items: [], total: 0 };
    }

    // Aggregate leads from all campaigns
    const allLeads: unknown[] = [];
    let totalLeadsCount = 0;

    for (const campaign of campaigns.items) {
      const campaignId = (campaign as { id?: number })?.id;
      if (!campaignId) continue;

      try {
        const params = new URLSearchParams();
        // Smartlead API uses offset/limit or different pagination - try without limit first
        if (opts.page) params.set("offset", String((opts.page - 1) * (opts.pageSize || DEFAULT_PAGE_SIZE)));
        if (opts.status) params.set("status", opts.status);

        const body = await this.getJson<LeadResponsePage>(
          `/campaigns/${campaignId}/leads`,
          params,
        );
        const leads = (body.leads as unknown[]) || (body.data as unknown[]) || [];

        // Filter by status if specified
        const filteredLeads = opts.status
          ? leads.filter((lead: any) => lead.status === opts.status)
          : leads;

        allLeads.push(...filteredLeads);

        // Add to total count (prefer total_leads from API if available)
        if (body.total_leads !== undefined) {
          const campaignTotal = typeof body.total_leads === 'string'
            ? parseInt(body.total_leads, 10)
            : body.total_leads;
          totalLeadsCount += campaignTotal;
        }
      } catch (err) {
        // Skip campaigns that fail, continue with others
        continue;
      }
    }

    return { items: allLeads, total: totalLeadsCount || allLeads.length };
  }

  async listCampaigns(
    clientId: string,
    opts: { status?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ items: unknown[]; total?: number }> {
    const params = new URLSearchParams();
    // Smartlead API doesn't accept 'limit' - try without it or use offset
    if (opts.page) params.set("offset", String((opts.page - 1) * (opts.pageSize || DEFAULT_PAGE_SIZE)));
    // Try to filter by client_id if the API supports it
    params.set("client_id", clientId);
    // Note: Smartlead API doesn't accept 'status' parameter for campaigns endpoint

    const body = await this.getJson<CampaignResponsePage | unknown[]>(
      `/campaigns`,
      params,
    );

    // Handle both array response and object response
    let items: unknown[];
    if (Array.isArray(body)) {
      items = body;
    } else {
      items = (body.campaigns as unknown[]) || (body.data as unknown[]) || [];
    }

    // Filter by client_id and optionally by status client-side
    items = items.filter((campaign: any) => {
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

  private async getJson<T>(
    path: string,
    params?: URLSearchParams,
  ): Promise<T> {
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

    return (await response.json()) as T;
  }

  private buildUrl(path: string, params?: URLSearchParams): string {
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
}

