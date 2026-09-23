export type EvolutionConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'qrcode_ready'
  | 'disconnected'
  | 'error'
  | 'unknown';

export interface EvolutionConfig {
  id?: string;
  account_id?: string;
  server_url: string;
  api_key: string;
  instance_name: string;
  instance_token?: string;
  status: EvolutionConnectionStatus;
  phone_number?: string | null;
  profile_name?: string | null;
  profile_pic_url?: string | null;
  webhook_url?: string;
  auto_webhook?: boolean;
  reject_calls?: boolean;
  always_online?: boolean;
  read_messages?: boolean;
  connected_at?: string | null;
  updated_at?: string;
}

export interface EvolutionInstanceState {
  instanceName: string;
  state: 'open' | 'connecting' | 'close' | 'refused' | 'unknown';
  owner?: string | null;
  profileName?: string | null;
  profilePictureUrl?: string | null;
  number?: string | null;
  qrcode?: {
    code?: string;
    base64?: string;
    pairingCode?: string;
    count?: number;
  } | null;
}

export interface EvolutionWebhookEventPayload {
  event: string;
  instance: string;
  data: Record<string, unknown>;
  destination?: string;
  date_time?: string;
  server_url?: string;
  apikey?: string;
}
