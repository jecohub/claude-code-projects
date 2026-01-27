import type { HealthStatus, TrendDirection } from '../../core/types.js';

/**
 * Get health status based on days remaining
 */
export function getHealthStatus(daysRemaining: number, hasLeadsRemaining: boolean): HealthStatus {
  if (!hasLeadsRemaining) return 'Empty';
  if (daysRemaining <= 1) return 'Low';
  if (daysRemaining <= 4) return 'Prepare';
  return 'Full';
}

/**
 * Get status icon
 */
export function getStatusIcon(status: HealthStatus): string {
  switch (status) {
    case 'Low': return '🔴';
    case 'Prepare': return '🟡';
    case 'Full': return '🟢';
    case 'Empty': return '⚪';
  }
}

/**
 * Get trend icon
 */
export function getTrendIcon(direction: TrendDirection): string {
  switch (direction) {
    case 'accelerating': return '📈';
    case 'stable': return '➡️';
    case 'slowing': return '📉';
    case 'insufficient_data': return '⏳';
  }
}

/**
 * Calculate trend direction based on percent change
 */
export function getTrendDirection(percentChange: number | null): TrendDirection {
  if (percentChange === null) return 'insufficient_data';
  if (percentChange > 10) return 'accelerating';
  if (percentChange < -10) return 'slowing';
  return 'stable';
}

/**
 * Count sending days between two dates based on configured sending days
 */
export function countSendingDays(startDate: Date, endDate: Date, sendingDays: number[]): number {
  if (sendingDays.length === 0) {
    const diffTime = endDate.getTime() - startDate.getTime();
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    if (sendingDays.includes(current.getDay())) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return Math.max(1, count);
}

/**
 * Project future date based on sending days needed
 */
export function projectRunOutDate(fromDate: Date, sendingDaysNeeded: number, sendingDays: number[]): Date {
  if (sendingDays.length === 0 || sendingDays.length === 7) {
    const result = new Date(fromDate);
    result.setDate(result.getDate() + sendingDaysNeeded);
    return result;
  }

  const result = new Date(fromDate);
  let daysAdded = 0;

  while (daysAdded < sendingDaysNeeded) {
    result.setDate(result.getDate() + 1);
    if (sendingDays.includes(result.getDay())) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Format date as "January 21, 2026"
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Parse lead sequence position from lead object
 * Returns 0 for "Not Started", or the sequence number (1, 2, 3...)
 */
export function getLeadSequencePosition(lead: any): number {
  const leadData = lead.lead || lead;
  const status = leadData.lead_status || leadData.status || '';

  const emailMatch = status.match(/Email\s*(\d+)/i);
  if (emailMatch) {
    return parseInt(emailMatch[1], 10);
  }

  if (typeof leadData.current_sequence === 'number') {
    return leadData.current_sequence;
  }
  if (typeof leadData.seq_number === 'number') {
    return leadData.seq_number;
  }

  if (status === '--' || status === '' || status.toLowerCase() === 'not started') {
    return 0;
  }

  return 0;
}

/**
 * Calculate emails remaining for a single lead
 */
export function calculateEmailsRemaining(sequencePosition: number, totalSequenceSteps: number): number {
  return Math.max(0, totalSequenceSteps - sequencePosition);
}
