import dotenv from "dotenv";
import { SmartleadClient } from "../src/smartleadClient.js";
import { getConfig } from "../src/config.js";

dotenv.config();

async function main() {
  const config = getConfig();
  const client = new SmartleadClient(config);
  const clientId = "128520";

  console.log("Testing SmartleadClient directly...\n");

  console.log("Getting campaign report (December 17, 2025 onwards)...");
  try {
    const filterDate = new Date("2025-12-17T00:00:00Z");
    const report = await client.getCampaignReport(clientId, filterDate);

    console.log("\n=== SUMMARY (Dec 17, 2025 onwards) ===");
    console.log(`Total Campaigns: ${report.totalCampaigns}`);
    console.log(`Active: ${report.activeCampaigns}, Paused: ${report.pausedCampaigns}`);
    console.log(`Total Leads: ${report.summary.totalLeads.toLocaleString()}`);

    console.log("\n=== STATUS BREAKDOWN ===");
    console.log(`Not Started: ${report.summary.notStarted.toLocaleString()} (${((report.summary.notStarted / report.summary.totalLeads) * 100).toFixed(1)}%)`);
    console.log(`In Progress: ${report.summary.inprogress.toLocaleString()} (${((report.summary.inprogress / report.summary.totalLeads) * 100).toFixed(1)}%)`);
    console.log(`Completed: ${report.summary.completed.toLocaleString()} (${((report.summary.completed / report.summary.totalLeads) * 100).toFixed(1)}%)`);
    console.log(`Blocked: ${report.summary.blocked.toLocaleString()} (${((report.summary.blocked / report.summary.totalLeads) * 100).toFixed(1)}%)`);
    console.log(`Stopped: ${report.summary.stopped.toLocaleString()} (${((report.summary.stopped / report.summary.totalLeads) * 100).toFixed(1)}%)`);

    console.log("\n=== ALL ACTIVE CAMPAIGNS ===");
    const activeList = report.campaigns.filter(c => c.campaignStatus === "ACTIVE");

    for (const campaign of activeList) {
      console.log(`\n${campaign.campaignName}`);
      console.log(`  Status: ${campaign.campaignStatus} | Created: ${new Date(campaign.createdAt).toLocaleDateString()}`);
      console.log(`  Leads: Not Started=${campaign.leadCounts.notStarted.toLocaleString()}, In Progress=${campaign.leadCounts.inprogress.toLocaleString()}, Completed=${campaign.leadCounts.completed.toLocaleString()}, Blocked=${campaign.leadCounts.blocked.toLocaleString()}, Stopped=${campaign.leadCounts.stopped.toLocaleString()}`);
      console.log(`  Total: ${campaign.leadCounts.total.toLocaleString()}`);
      console.log(`  Email Stats: Sent=${campaign.emailStats.sent.toLocaleString()}, Opened=${campaign.emailStats.opened.toLocaleString()}, Clicked=${campaign.emailStats.clicked.toLocaleString()}, Replied=${campaign.emailStats.replied.toLocaleString()}, Bounced=${campaign.emailStats.bounced.toLocaleString()}`);

      if (campaign.configuration) {
        console.log(`  Config: Max/Day=${campaign.configuration.maxLeadsPerDay}, Sending Days=${campaign.configuration.sendingDays.join(',')}, Hours=${campaign.configuration.scheduleHours}, Sequences=${campaign.configuration.sequenceSteps}`);
      }
    }

    const pausedList = report.campaigns.filter(c => c.campaignStatus === "PAUSED");
    if (pausedList.length > 0) {
      console.log(`\n=== PAUSED CAMPAIGNS (${pausedList.length}) ===`);
      for (const campaign of pausedList) {
        console.log(`  ${campaign.campaignName} - Total: ${campaign.leadCounts.total.toLocaleString()} (Not Started: ${campaign.leadCounts.notStarted.toLocaleString()}, In Progress: ${campaign.leadCounts.inprogress.toLocaleString()})`);
      }
    }

    if (report.meta.notes && report.meta.notes.length > 0) {
      console.log(`\nNotes: ${report.meta.notes.join(", ")}`);
    }
  } catch (err) {
    console.error("Error getting campaign report:", err);
  }
}

main().catch(console.error);
