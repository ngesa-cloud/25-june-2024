#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const victimsPath = path.join(repoRoot, 'public/api/victims.json');
const outputPath = path.join(repoRoot, 'public/api/accountability.json');
const badgeJsonPath = path.join(repoRoot, 'public/api/badge.json');

const incidentDate = new Date('2024-06-25T00:00:00Z');
const now = new Date();

const msPerDay = 1000 * 60 * 60 * 24;
const daysElapsed = Math.floor((now.getTime() - incidentDate.getTime()) / msPerDay);

let victims = [];
if (fs.existsSync(victimsPath)) {
  victims = JSON.parse(fs.readFileSync(victimsPath, 'utf8'));
}

const totalFatalities = victims.length || 17;
const officersCharged = 0; // Confirmed 0 across official dockets
const officersConvicted = 0;

const statusBreakdown = {
  active_ipoa_inquiry: victims.filter(v => v.case_status && v.case_status.toLowerCase().includes('ipoa')).length,
  odpp_review_or_inquest: victims.filter(v => v.case_status && v.case_status.toLowerCase().includes('odpp')).length,
  stalled_or_unupdated: victims.filter(v => v.case_status && v.case_status.toLowerCase().includes('stalled')).length
};

const payload = {
  schema_version: "1.0.0",
  incident_date: "2024-06-25T00:00:00Z",
  last_updated: now.toISOString(),
  days_elapsed: daysElapsed,
  total_documented_fatalities: totalFatalities,
  officers_charged: officersCharged,
  officers_convicted: officersConvicted,
  justice_delay_rate: "100%",
  accountability_metric: `${daysElapsed} Days Since 25 June 2024 — 0 Officers Charged`,
  status_breakdown: statusBreakdown,
  human_rights_standards: [
    "UN Basic Principles on the Use of Force and Firearms by Law Enforcement Officials",
    "African Charter on Human and Peoples' Rights (Article 4: Right to Life)",
    "Constitution of Kenya 2010 (Article 26, Article 37)"
  ]
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

// Also create root api/ for compatibility
const rootApiOut = path.join(repoRoot, 'api/accountability.json');
fs.mkdirSync(path.dirname(rootApiOut), { recursive: true });
fs.writeFileSync(rootApiOut, JSON.stringify(payload, null, 2) + '\n', 'utf8');

// Shields.io endpoint badge
const badgePayload = {
  schemaVersion: 1,
  label: "ACCOUNTABILITY CLOCK",
  message: `${daysElapsed} Days | 0 Charged`,
  color: "red",
  namedLogo: "clock",
  logoColor: "white",
  style: "for-the-badge"
};

fs.writeFileSync(badgeJsonPath, JSON.stringify(badgePayload, null, 2) + '\n', 'utf8');
const rootBadgeOut = path.join(repoRoot, 'api/badge.json');
fs.writeFileSync(rootBadgeOut, JSON.stringify(badgePayload, null, 2) + '\n', 'utf8');

console.log(`[+] Accountability Clock Updated: ${daysElapsed} days elapsed since 25 June 2024.`);
