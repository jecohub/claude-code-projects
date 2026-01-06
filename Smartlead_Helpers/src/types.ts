export interface ClientStatusSnapshot {
  clientId: string;
  totals: {
    leads?: number;
    uncontactedLeads?: number;
    pausedCampaigns?: number;
  };
  meta: {
    partial?: boolean;
    notes?: string[];
    collectedAt: string;
  };
}

export interface LeadStatusBreakdown {
  clientId: string;
  totalLeads: number;
  statusBreakdown: Record<string, number>;
  meta: {
    partial?: boolean;
    notes?: string[];
    collectedAt: string;
  };
}

export interface CampaignAnalyticsResponse {
  id: number;
  name: string;
  status: string;
  created_at: string;
  sent_count: string | number;
  open_count: string | number;
  click_count: string | number;
  reply_count: string | number;
  bounce_count: string | number;
  unique_sent_count: string | number;
  unique_open_count: string | number;
  unique_click_count: string | number;
  unsubscribed_count: string | number;
  total_count: string | number;
  campaign_lead_stats?: {
    total: number;
    paused: number;
    blocked: number;
    stopped: number;
    completed: number;
    inprogress: number;
    interested: number;
    notStarted: number;
  };
  [key: string]: unknown;
}

export interface CampaignDetailsResponse {
  id: number;
  name: string;
  status: string;
  created_at: string;
  max_leads_per_day: number;
  min_time_btwn_emails: number;
  scheduler_cron_value?: {
    tz: string;
    days: number[];
    endHour: string;
    startHour: string;
  };
  [key: string]: unknown;
}

export interface CampaignSequenceResponse {
  seq_number: number;
  subject: string;
  email_body: string;
  [key: string]: unknown;
}

export interface CampaignAnalytics {
  campaignId: number;
  campaignName: string;
  campaignStatus: string;
  createdAt: string;
  leadCounts: {
    notStarted: number;
    inprogress: number;
    completed: number;
    blocked: number;
    stopped: number;
    total: number;
  };
  emailStats: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
  };
  configuration?: {
    senderAccounts: number;
    maxLeadsPerDay: number;
    sendingDays: number[];
    scheduleHours: string;
    sequenceSteps: number;
  };
}

export interface PausedCampaignDetail {
  campaignId: number;
  campaignName: string;
  createdAt: string;
  totalLeads: number;
  notStarted: number;
  inProgress: number;
}

export interface ClientCampaignReport {
  clientId: string;
  totalCampaigns: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  campaigns: CampaignAnalytics[];
  summary: {
    notStarted: number;
    inprogress: number;
    completed: number;
    blocked: number;
    stopped: number;
    totalLeads: number;
  };
  activeLeadsSummary: {
    notStarted: number;
    inprogress: number;
    blocked: number;
    stopped: number;
    totalActive: number;
  };
  pausedCampaignDetails: PausedCampaignDetail[];
  meta: {
    partial?: boolean;
    notes?: string[];
    collectedAt: string;
  };
}

export interface LeadResponsePage {
  data?: unknown[];
  leads?: unknown[];
  total_leads?: string | number;
  offset?: number;
  limit?: number;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    has_more?: boolean;
    next_page?: number | null;
    next?: string | null;
  };
  next_page?: number | null;
  has_more?: boolean;
  next?: string | null;
  [key: string]: unknown;
}

export interface CampaignResponsePage {
  data?: unknown[];
  campaigns?: unknown[];
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    has_more?: boolean;
    next_page?: number | null;
    next?: string | null;
  };
  next_page?: number | null;
  has_more?: boolean;
  next?: string | null;
  [key: string]: unknown;
}

