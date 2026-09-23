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

export const DEMO_METRICS = {
  activeConversations: { current: 142, previous: 12 },
  newContactsToday: { current: 28, previous: 19 },
  openDealsValue: 48500,
  openDealsCount: 17,
  messagesSentToday: { current: 634, previous: 512 },
};

export const DEMO_CONVERSATIONS_SERIES = [
  { date: "Mon", conversations: 45, messages: 180 },
  { date: "Tue", conversations: 52, messages: 210 },
  { date: "Wed", conversations: 48, messages: 195 },
  { date: "Thu", conversations: 61, messages: 240 },
  { date: "Fri", conversations: 55, messages: 220 },
  { date: "Sat", conversations: 32, messages: 120 },
  { date: "Sun", conversations: 38, messages: 140 },
];

export const DEMO_PIPELINE = {
  totalValue: 48500,
  dealCount: 17,
  stages: [
    { name: "Lead Inbound", count: 7, value: 12000, color: "#10b981" },
    { name: "Demo Scheduled", count: 4, value: 14500, color: "#3b82f6" },
    { name: "Proposal Sent", count: 3, value: 11000, color: "#f59e0b" },
    { name: "Negotiation", count: 3, value: 11000, color: "#8b5cf6" },
  ],
};

export const DEMO_RESPONSE_TIME = {
  medianSeconds: 84,
  p90Seconds: 230,
  buckets: [
    { range: "< 1m", count: 86 },
    { range: "1-5m", count: 34 },
    { range: "5-15m", count: 12 },
    { range: "> 15m", count: 4 },
  ],
};

export const DEMO_ACTIVITY = [
  {
    id: "act-1",
    type: "message_received",
    title: "New WhatsApp lead from Marcus Vance",
    description: "Interested in the enterprise WhatsApp multi-agent setup.",
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "act-2",
    type: "deal_moved",
    title: "Deal moved to Proposal Sent",
    description: "Apex Global ($15,000) stage updated by Alex.",
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: "act-3",
    type: "broadcast_sent",
    title: "Campaign 'VIP Customer Flash Promo' completed",
    description: "Delivered to 1,240 contacts with 98.4% read rate.",
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
];
