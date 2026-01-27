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

// CSV Processing Types
export interface LeadRow {
  [key: string]: string;
}

export interface LeadClassification {
  isOutlook: boolean;
  isValid: boolean;
  isCatchAll: boolean;
}

export interface ClassifiedLead {
  row: LeadRow;
  classification: LeadClassification;
}

export type GroupType =
  | 'outlook-valid'
  | 'outlook-catchall'
  | 'nonoutlook-valid'
  | 'nonoutlook-catchall';

export interface LeadSplit {
  groupType: GroupType;
  splitNumber: number;
  leads: LeadRow[];
  campaignName: string;
}

// API Request/Response Types
export interface Lead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone_number?: string;
  website?: string;
  location?: string;
  linkedin_profile?: string;
  company_url?: string;
  custom_fields?: Record<string, string>;
  [key: string]: string | Record<string, string> | undefined;
}

export interface CampaignCreateRequest {
  name: string;
  client_id?: string;
}

export interface CampaignCreateResponse {
  id: number;
  name: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

export interface AddLeadsRequest {
  lead_list: Lead[];
  settings?: {
    ignore_global_block_list?: boolean;
    ignore_unsubscribe_list?: boolean;
    ignore_duplicate_leads_in_other_campaign?: boolean;
  };
}

export interface AddLeadsResponse {
  ok: boolean;
  upload_count: number;
  total_leads: number;
  block_count: number;
  duplicate_count: number;
  invalid_email_count: number;
  invalid_emails: string[];
  already_added_to_campaign: number;
  unsubscribed_leads: string[];
  is_lead_limit_exhausted: boolean;
  lead_import_stopped_count: number;
  bounce_count: number;
  /**
   * Internal helper for the local lead ledger feature.
   * When present, this is the set of emails considered "new" after de-duping against existing campaign leads.
   * (Not part of Smartlead's public API response.)
   */
  ledger_new_lead_emails?: string[];
  // Backwards compatibility
  uploaded_count?: number;
  unsubscribed_count?: number;
}

export interface CampaignSettings {
  track_settings?: unknown;
  stop_lead_settings?: unknown;
  unsubscribe_text?: string;
  send_as_plain_text?: boolean;
  follow_up_percentage?: number;
  client_id?: string;
  enable_ai_esp_matching?: boolean;
  [key: string]: unknown;
}

export interface CampaignSchedule {
  timezone?: string;
  days_of_the_week?: number[];
  start_hour?: string;
  end_hour?: string;
  min_time_btw_emails?: number;
  max_new_leads_per_day?: number;
  schedule_start_time?: string;
  [key: string]: unknown;
}

// Field Mapping Types
export type SmartleadFieldType =
  | "email"
  | "first_name"
  | "last_name"
  | "company_name"
  | "phone_number"
  | "website"
  | "location"
  | "linkedin_profile"
  | "company_url"
  | "custom";

export interface FieldMappingPreview {
  csvColumn: string;
  detectedField: SmartleadFieldType;
  sampleValues: string[];
}

// Bulk Upload Types
export interface BulkUploadParams {
  csvFilePath: string;
  sourceCampaignId: number;
  clientId?: string;
  ignoreGlobalBlockList?: boolean;
  isNewCampaign?: boolean;
}

export interface CampaignUploadResult {
  campaignId: number;
  campaignName: string;
  groupType: string;
  splitNumber: number;
  totalLeads: number;
  uploadedLeads: number;
  failedLeads: number;
  errors: string[];
}

export interface BulkUploadResult {
  success: boolean;
  totalSplits: number;
  campaignResults: CampaignUploadResult[];
  summary: {
    totalLeadsProcessed: number;
    totalLeadsUploaded: number;
    totalLeadsFailed: number;
    campaignsCreated: number;
  };
  errors: string[];
}

// Campaign Duplication Types
export type DuplicationStepStatus = 'success' | 'failed' | 'skipped' | 'partial';

export interface DuplicationStep {
  name: string;
  status: DuplicationStepStatus;
  message?: string;
  error?: string;
  timestamp: string;
  duration?: number; // milliseconds
}

export interface DuplicateCampaignOptions {
  throwOnError?: boolean;
  verifyAfterCopy?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
  verbose?: boolean;
  skipSequences?: boolean;
  skipSchedule?: boolean;
  skipSettings?: boolean;
  /**
   * Skip copying UI-only settings via Smartlead's internal GraphQL API
   * (AI lead categorisation, bounce auto-protection, OOO detection settings).
   */
  skipUiOnlySettings?: boolean;
  /**
   * Optional Smartlead web bearer token for internal GraphQL calls.
   * If omitted, the client will use SMARTLEAD_WEB_AUTH_TOKEN (if set).
   *
   * Can be provided with or without the "Bearer " prefix.
   */
  uiAuthToken?: string;
}

export interface DuplicateCampaignResult {
  success: boolean;
  campaignId: number;
  campaignName: string;
  sourceCampaignId: number;
  copied: {
    settings: boolean;
    uiOnlySettings: boolean;
    schedule: boolean;
    sequences: boolean;
    sequenceCount?: number;
  };
  steps: DuplicationStep[];
  verification?: {
    verified: boolean;
    settingsMatch: boolean;
    scheduleMatch: boolean;
    sequenceCountMatch: boolean;
    expectedSequences: number;
    actualSequences: number;
    details?: string[];
  };
  warnings: string[];
  errors: string[];
  duration: number;
  startedAt: string;
  completedAt: string;
}

export interface CampaignValidation {
  isValid: boolean;
  hasSettings: boolean;
  hasSchedule: boolean;
  hasSequences: boolean;
  sequenceCount: number;
  issues: string[];
  warnings: string[];
}

// ========================================
// Campaign Success Analyzer Types
// ========================================

/**
 * Lead categorization breakdown by AI category
 */
export interface LeadCategorization {
  interested: number;
  meetingRequest: number;
  informationRequest: number;
  notInterested: number;
  doNotContact: number;
  outOfOffice: number;
  wrongPerson: number;
  automatedResponse: number;
  referredToSomeone: number;
  futurePipeline: number;
  uncategorized: number;
}

/**
 * Positive responses subset (Interested + Meeting Request + Information Request)
 */
export interface PositiveResponses {
  interested: number;
  meetingRequest: number;
  informationRequest: number;
  total: number;
}

/**
 * Email engagement metrics with calculated rates
 */
export interface EngagementMetrics {
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  bounces: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

/**
 * Composite score weight configuration
 */
export interface ScoringWeights {
  sends: number;
  opens: number;
  clicks: number;
  positiveResponses: number;
}

/**
 * Success metrics for a single campaign
 */
export interface CampaignSuccessMetrics {
  campaignId: number;
  campaignName: string;
  campaignStatus: string;
  campaignUrl: string;
  createdAt: string;
  engagement: EngagementMetrics;
  categorization: LeadCategorization;
  positiveResponses: PositiveResponses;
  positiveResponseRate: number;
  compositeScore: number;
  scoreBreakdown: ScoringWeights;
}

/**
 * Aggregated metrics across all campaigns
 */
export interface AggregatedMetrics {
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  totalBounces: number;
  totalPositiveResponses: number;
  averageOpenRate: number;
  averageClickRate: number;
  averageReplyRate: number;
  averagePositiveResponseRate: number;
}

/**
 * Top performing campaigns by different metrics
 */
export interface TopPerformers {
  byCompositeScore: CampaignSuccessMetrics[];
  byOpenRate: CampaignSuccessMetrics[];
  byPositiveResponse: CampaignSuccessMetrics[];
}

/**
 * Full campaign success report
 */
export interface CampaignSuccessReport {
  clientId: string;
  generatedAt: string;
  totalCampaigns: number;
  aggregated: AggregatedMetrics;
  campaigns: CampaignSuccessMetrics[];
  topPerformers: TopPerformers;
  meta: {
    analysisVersion: string;
    scoringWeights: ScoringWeights;
    notes: string[];
  };
}

// ========================================
// Campaign Health Types
// ========================================

export type HealthStatus = 'Low' | 'Prepare' | 'Full' | 'Empty';

export type TrendDirection = 'accelerating' | 'stable' | 'slowing' | 'insufficient_data';

/**
 * Email account used for sending campaign emails
 */
export interface EmailAccount {
  id: number;
  from_name: string;
  from_email: string;
  is_smtp_success: boolean;
  type: string; // GMAIL, SMTP, ZOHO, OUTLOOK
}

export interface CampaignHealth {
  status: HealthStatus;
  statusIcon: string;
  daysRemaining: number;
  runOutDate: Date | null;
  today: Date;
  remainingLeads: {
    total: number;
    notStarted: number;
    inProgress: number;
  };
  avgSendRate: number; // emails per day
  trend: {
    direction: TrendDirection;
    percentChange: number | null;
    icon: string;
  };
  emailsRemaining: number;
  /** Breakdown of emails remaining by lead status */
  emailsRemainingBreakdown: {
    notStarted: number;      // exact: notStarted × sequenceSteps
    inProgress: number;      // estimated based on sent count
    isEstimated: boolean;    // true if In Progress is estimated
  };
  totalEmailsSent: number;
  sendingDaysPerWeek: number;
  campaignStartDate: Date | null;
  activeSenderCount: number; // Unique email accounts able to send
  message?: string; // For edge cases like "No active campaigns"
}

