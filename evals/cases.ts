// Eval cases: posting × profile × output language, with the expected posting
// language and a fit-score range. Ranges were set by reading each posting
// against the profile *before* any model run, and must not be tuned to match
// model output. Bands: good ≥ 60, partial ≈ 25–75, poor ≤ 35 (poor postings
// still list soft skills, e.g. communication, that a developer can evidence).
//
// Postings: real ones from public Greenhouse/Ashby boards (see each file's
// `source`). Profiles: synthetic; dev-fr is dev-en written in French with
// different bullet ids.
import type { Language, ScoreRange } from "./lib/checks";

export type PostingId =
  | "en-appdirect-intermediate-dev"
  | "en-hopper-senior-fullstack"
  | "en-lightspeed-senior-ios"
  | "en-lightspeed-staff-sre"
  | "en-appdirect-revenue-accounting"
  | "fr-appdirect-dev-intermediaire"
  | "fr-appdirect-dev-php"
  | "fr-lightspeed-dev-servicenow"
  | "fr-appdirect-comptabilite-revenus"
  | "fr-lightspeed-relations-publiques";

export type ProfileId = "dev-en" | "dev-fr";

export type EvalCase = {
  id: string;
  posting: PostingId;
  profile: ProfileId;
  outputLanguage: Language;
  expect: { language: Language; score: ScoreRange };
};

const GOOD = [60, 100] as const;
const POOR = [0, 35] as const;

export const CASES: EvalCase[] = [
  // ── Same language ────────────────────────────────────────────────────
  {
    // Java/Spring REST+GraphQL, PostgreSQL, Kafka/SQS, tests, warehouse ops:
    // nearly every duty has a direct bullet.
    id: "en-intermediate-dev",
    posting: "en-appdirect-intermediate-dev",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "en", score: GOOD },
  },
  {
    // React/TS, REST/event-driven, on-call, AI tools all evidenced; realtime
    // voice/WebRTC is at best a minor gap (WebSockets); the four "bonus"
    // items (voice AI, CPaaS, CRM, travel) are gaps but weigh 1 each.
    id: "en-hopper-fullstack",
    posting: "en-hopper-senior-fullstack",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "en", score: [50, 95] },
  },
  {
    // SwiftUI, UIKit/Swift and Apple HIG are major gaps; tests, software
    // design and AI tools are evidenced.
    id: "en-ios",
    posting: "en-lightspeed-senior-ios",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "en", score: [15, 60] },
  },
  {
    // Observability/SLOs, CI, communication and mentoring are evidenced;
    // deep GCP, Terraform, Looker/Vertex AI and Go are gaps.
    id: "en-sre",
    posting: "en-lightspeed-staff-sre",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "en", score: [25, 75] },
  },
  {
    // Revenue accounting (ASC 606, NetSuite, accounting degree): only the
    // generic analysis/communication items can match.
    id: "en-revenue-accounting",
    posting: "en-appdirect-revenue-accounting",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "en", score: POOR },
  },
  {
    // Same job as en-intermediate-dev, posted in French.
    id: "fr-dev-intermediaire",
    posting: "fr-appdirect-dev-intermediaire",
    profile: "dev-fr",
    outputLanguage: "fr",
    expect: { language: "fr", score: GOOD },
  },
  {
    // PHP and MySQL are missing (JavaScript is there); bilingualism, REST/
    // GraphQL, full stack, AI-assisted development and 5+ years are evidenced.
    id: "fr-dev-php",
    posting: "fr-appdirect-dev-php",
    profile: "dev-fr",
    outputLanguage: "fr",
    expect: { language: "fr", score: [45, 95] },
  },
  {
    // ServiceNow, ITSM and Flow Designer are major gaps; JavaScript, REST/
    // OAuth integrations, documentation and stakeholder work are evidenced.
    id: "fr-servicenow",
    posting: "fr-lightspeed-dev-servicenow",
    profile: "dev-fr",
    outputLanguage: "fr",
    expect: { language: "fr", score: [20, 65] },
  },
  {
    // French version of en-revenue-accounting.
    id: "fr-comptabilite",
    posting: "fr-appdirect-comptabilite-revenus",
    profile: "dev-fr",
    outputLanguage: "fr",
    expect: { language: "fr", score: POOR },
  },
  {
    // Public relations: media relations, PR experience and crisis
    // communication are major gaps.
    id: "fr-relations-publiques",
    posting: "fr-lightspeed-relations-publiques",
    profile: "dev-fr",
    outputLanguage: "fr",
    expect: { language: "fr", score: POOR },
  },

  // ── Cross language ───────────────────────────────────────────────────
  {
    // English job, French profile, French explanation.
    id: "x-en-job-fr-profile",
    posting: "en-appdirect-intermediate-dev",
    profile: "dev-fr",
    outputLanguage: "fr",
    expect: { language: "en", score: GOOD },
  },
  {
    // French job, English profile, English explanation.
    id: "x-fr-job-en-profile",
    posting: "fr-appdirect-dev-intermediaire",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "fr", score: GOOD },
  },
  {
    // Job and profile in English; only the explanation is French.
    id: "x-en-job-fr-output",
    posting: "en-hopper-senior-fullstack",
    profile: "dev-en",
    outputLanguage: "fr",
    expect: { language: "en", score: [50, 95] },
  },
  {
    // Partial fit across languages.
    id: "x-fr-servicenow-en",
    posting: "fr-lightspeed-dev-servicenow",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "fr", score: [20, 65] },
  },
  {
    // Poor fit across languages must stay poor.
    id: "x-fr-comptabilite-en",
    posting: "fr-appdirect-comptabilite-revenus",
    profile: "dev-en",
    outputLanguage: "en",
    expect: { language: "fr", score: POOR },
  },
];
