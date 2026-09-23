import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types';

/**
 * Demo mock user and account state for previewing WACRM
 * when external Supabase credentials are not yet configured.
 */

export const DEMO_USER = {
  id: "demo-user-1234-5678-9abc",
  aud: "authenticated",
  role: "authenticated",
  email: "demo@wacrm.local",
  app_metadata: { provider: "email" },
  user_metadata: { full_name: "Alex Rivera (Demo Admin)" },
  created_at: new Date().toISOString(),
};

export const DEMO_PROFILE = {
  id: "demo-profile-1234-5678",
  full_name: "Alex Rivera",
  email: "demo@wacrm.local",
  avatar_url: null,
  role: "admin",
  beta_features: ["flows", "ai_agent"],
  account_id: "demo-account-1234",
  account_role: "owner" as const,
};

export const DEMO_ACCOUNT = {
  id: "demo-account-1234",
  name: "Acme WhatsApp Sales",
  default_currency: "USD",
};

export const DEMO_METRICS: MetricsBundle = {
  activeConversations: { current: 142, previous: 12 },
  newContactsToday: { current: 28, previous: 19 },
  openDealsValue: 48500,
  openDealsCount: 17,
  messagesSentToday: { current: 634, previous: 512 },
};

export const DEMO_CONVERSATIONS_SERIES: ConversationsSeriesPoint[] = [
  { day: "2026-09-17", incoming: 45, outgoing: 135 },
  { day: "2026-09-18", incoming: 52, outgoing: 158 },
  { day: "2026-09-19", incoming: 48, outgoing: 147 },
  { day: "2026-09-20", incoming: 61, outgoing: 179 },
  { day: "2026-09-21", incoming: 55, outgoing: 165 },
  { day: "2026-09-22", incoming: 32, outgoing: 88 },
  { day: "2026-09-23", incoming: 38, outgoing: 102 },
];

export const DEMO_PIPELINE: PipelineDonutData = {
  totalValue: 48500,
  stages: [
    { id: "lead-inbound", name: "Lead Inbound", dealCount: 7, totalValue: 12000, color: "#10b981" },
    { id: "demo-scheduled", name: "Demo Scheduled", dealCount: 4, totalValue: 14500, color: "#3b82f6" },
    { id: "proposal-sent", name: "Proposal Sent", dealCount: 3, totalValue: 11000, color: "#f59e0b" },
    { id: "negotiation", name: "Negotiation", dealCount: 3, totalValue: 11000, color: "#8b5cf6" },
  ],
};

export const DEMO_RESPONSE_TIME: ResponseTimeSummary = {
  thisWeekAvg: 84,
  lastWeekAvg: 112,
  buckets: [
    { dow: 0, avgMinutes: 1.2, samples: 45 },
    { dow: 1, avgMinutes: 1.4, samples: 52 },
    { dow: 2, avgMinutes: 1.1, samples: 48 },
    { dow: 3, avgMinutes: 1.8, samples: 61 },
    { dow: 4, avgMinutes: 1.5, samples: 55 },
    { dow: 5, avgMinutes: 2.2, samples: 32 },
    { dow: 6, avgMinutes: 2.0, samples: 38 },
  ],
};

export const DEMO_ACTIVITY: ActivityItem[] = [
  {
    id: "act-1",
    kind: "message",
    text: "New WhatsApp lead from Marcus Vance: Interested in enterprise setup",
    at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    href: "/inbox",
  },
  {
    id: "act-2",
    kind: "deal",
    text: "Deal moved to Proposal Sent: Apex Global ($15,000) by Alex",
    at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    href: "/deals",
  },
  {
    id: "act-3",
    kind: "broadcast",
    text: "Campaign 'VIP Customer Flash Promo' completed (1,240 contacts, 98.4% read rate)",
    at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    href: "/broadcasts",
  },
];
