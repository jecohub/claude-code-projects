import { promises as fs } from "fs";
import { parse } from "csv-parse/sync";
import { SmartleadClient } from "../../core/smartleadClient.js";
import {
  MailboxSwapParams,
  MailboxSwapReport,
  CampaignSwapResult,
} from "../../core/types.js";

export class MailboxSwapService {
  constructor(private readonly client: SmartleadClient) {}

  async execute(params: MailboxSwapParams): Promise<MailboxSwapReport> {
    const {
      csvFilePath,
      clientId,
      fromDate,
      toDate,
      minReputation,
      maxReputation,
      activateCampaigns = false,
      removeExistingMailboxes = true,
      dryRun = true,
    } = params;

    // ── Step 1: Parse CSV ────────────────────────────────────────────────
    const csvEmails = await this.parseCsvEmails(csvFilePath);

    // ── Step 2: Look up each email in Smartlead ──────────────────────────
    const allClientAccounts = await this.client.getClientEmailAccounts(clientId);
    const accountByEmail = new Map(
      allClientAccounts.map((a) => [a.from_email.toLowerCase(), a])
    );

    const foundAccounts = csvEmails
      .map((email) => accountByEmail.get(email.toLowerCase()))
      .filter((a): a is NonNullable<typeof a> => a !== undefined);

    // ── Step 3: Filter by warmup reputation ─────────────────────────────
    const reputationResults = await Promise.all(
      foundAccounts.map(async (account) => {
        const rep = await this.client.getEmailAccountWarmupStats(account.id);
        return { account, reputation: rep };
      })
    );

    const qualifiedAccounts = reputationResults
      .filter(({ reputation }) => reputation >= minReputation && reputation <= maxReputation)
      .map(({ account }) => account);

    const mailboxStats = {
      totalInCsv: csvEmails.length,
      foundInAccount: foundAccounts.length,
      qualified: qualifiedAccounts.length,
      filteredOut: foundAccounts.length - qualifiedAccounts.length,
    };

    if (qualifiedAccounts.length === 0) {
      return this.buildReport(params, mailboxStats, 0, [], dryRun);
    }

    const qualifiedIds = qualifiedAccounts.map((a) => a.id);

    // ── Step 4: Fetch PAUSED campaigns in date range ──────────────────────
    const allCampaigns = await this.client.listCampaigns(clientId, { pageSize: 1000 });
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const targetCampaigns = (allCampaigns.items as Array<{ id: number; name: string; status: string; created_at: string }>)
      .filter((c) => {
        if (c.status !== 'PAUSED') return false;
        const created = new Date(c.created_at);
        return created >= from && created <= to;
      });

    if (targetCampaigns.length === 0) {
      return this.buildReport(params, mailboxStats, 0, [], dryRun);
    }

    // ── Step 5: Process each campaign ────────────────────────────────────
    const campaignResults: CampaignSwapResult[] = [];

    for (const campaign of targetCampaigns) {
      const existing = await this.client.getCampaignEmailAccounts(campaign.id);
      const existingIds = existing.map((a) => a.id);

      const action = this.describeAction(
        removeExistingMailboxes,
        existingIds.length,
        qualifiedIds.length,
      );

      if (dryRun) {
        campaignResults.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          createdAt: campaign.created_at,
          existingMailboxCount: existingIds.length,
          newMailboxCount: qualifiedIds.length,
          action,
          status: 'success',
          activated: activateCampaigns,
          errors: [],
        });
        continue;
      }

      // Live execution
      const errors: string[] = [];

      if (removeExistingMailboxes && existingIds.length > 0) {
        const removed = await this.client.removeEmailAccountsFromCampaign(campaign.id, existingIds);
        if (!removed) {
          errors.push(`Failed to remove ${existingIds.length} existing mailboxes`);
        }
      }

      const added = await this.client.addEmailAccountsToCampaign(campaign.id, qualifiedIds);
      if (!added) {
        errors.push(`Failed to add ${qualifiedIds.length} new mailboxes`);
      }

      let activated = false;
      if (activateCampaigns && errors.length === 0) {
        activated = await this.client.updateCampaignStatus(campaign.id, 'ACTIVE');
        if (!activated) {
          errors.push(`Failed to activate campaign`);
        }
      }

      campaignResults.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        createdAt: campaign.created_at,
        existingMailboxCount: existingIds.length,
        newMailboxCount: qualifiedIds.length,
        action,
        status: errors.length === 0 ? 'success' : 'partial_failure',
        activated,
        errors,
      });
    }

    return this.buildReport(params, mailboxStats, targetCampaigns.length, campaignResults, dryRun);
  }

  private describeAction(
    removeExisting: boolean,
    existingCount: number,
    newCount: number,
  ): string {
    if (existingCount === 0) return `Add ${newCount}`;
    if (removeExisting) return `Replace (remove ${existingCount}, add ${newCount})`;
    return `Add ${newCount} (keep ${existingCount} existing)`;
  }

  private buildReport(
    params: MailboxSwapParams,
    mailboxStats: MailboxSwapReport['mailboxStats'],
    pausedInRange: number,
    campaigns: CampaignSwapResult[],
    dryRun: boolean,
  ): MailboxSwapReport {
    const succeeded = campaigns.filter((c) => c.status === 'success').length;
    const partialFailed = campaigns.filter((c) => c.status === 'partial_failure').length;

    return {
      dryRun,
      clientId: params.clientId,
      fromDate: params.fromDate,
      toDate: params.toDate,
      reputationRange: { min: params.minReputation, max: params.maxReputation },
      activateCampaigns: params.activateCampaigns ?? false,
      removeExistingMailboxes: params.removeExistingMailboxes ?? true,
      mailboxStats,
      campaignStats: { pausedInRange },
      campaigns,
      summary: {
        fullySucceeded: succeeded,
        partiallyFailed: partialFailed,
        notTouched: pausedInRange - campaigns.length,
      },
    };
  }

  private async parseCsvEmails(csvFilePath: string): Promise<string[]> {
    const content = await fs.readFile(csvFilePath, 'utf-8');
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (rows.length === 0) return [];

    // Auto-detect the email column (first column, or one containing "email")
    const firstRow = rows[0];
    const keys = Object.keys(firstRow);
    const emailKey =
      keys.find((k) => k.toLowerCase().includes('email')) ?? keys[0];

    return rows
      .map((r) => r[emailKey]?.trim())
      .filter((e): e is string => !!e && e.includes('@'));
  }
}
