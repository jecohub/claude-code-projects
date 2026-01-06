import { SmartleadConfig } from "./config.js";
import {
  CampaignResponsePage,
  ClientStatusSnapshot,
  LeadResponsePage,
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
    for (const campaign of campaigns.items) {
      const campaignId = (campaign as { id?: number })?.id;
      if (!campaignId) continue;

      try {
        const params = new URLSearchParams();
        params.set("limit", String(opts.pageSize || DEFAULT_PAGE_SIZE));
        if (opts.page) params.set("page", String(opts.page));
        if (opts.status) params.set("status", opts.status);

        const body = await this.getJson<LeadResponsePage>(
          `/campaigns/${campaignId}/leads`,
          params,
        );
        const leads = (body.leads as unknown[]) || (body.data as unknown[]) || [];
        allLeads.push(...leads);
      } catch (err) {
        // Skip campaigns that fail, continue with others
        continue;
      }
    }

    return { items: allLeads, total: allLeads.length };
  }

  async listCampaigns(
    clientId: string,
    opts: { status?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ items: unknown[]; total?: number }> {
    const params = new URLSearchParams();
    params.set("limit", String(opts.pageSize || DEFAULT_PAGE_SIZE));
    if (opts.page) params.set("page", String(opts.page));
    // Try to filter by client_id if the API supports it
    params.set("client_id", clientId);
    if (opts.status) params.set("status", opts.status);

    const body = await this.getJson<CampaignResponsePage>(
      `/campaigns`,
      params,
    );
    
    // Filter by client_id client-side if API doesn't support it
    let items = (body.campaigns as unknown[]) || (body.data as unknown[]) || [];
    items = items.filter((campaign: any) => {
      const campaignClientId = campaign.client_id;
      return campaignClientId === Number(clientId) || campaignClientId === clientId;
    });

    const total =
      typeof body.meta?.total === "number"
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

