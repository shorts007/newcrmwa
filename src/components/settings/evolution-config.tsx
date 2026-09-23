'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  RadioTower,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  QrCode,
  RotateCw,
  PowerOff,
  ShieldCheck,
  Server,
  Smartphone,
  Webhook,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

export function EvolutionConfig() {
  const t = useTranslations('Settings.evolution');
  const { canEditSettings } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshingState, setRefreshingState] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form inputs
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [instanceName, setInstanceName] = useState('wacrm-main');
  const [instanceToken, setInstanceToken] = useState('');
  const [autoWebhook, setAutoWebhook] = useState(true);
  const [rejectCalls, setRejectCalls] = useState(false);
  const [alwaysOnline, setAlwaysOnline] = useState(true);
  const [readMessages, setReadMessages] = useState(false);

  // State info
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'connecting' | 'qrcode_ready' | 'disconnected' | 'error' | 'unknown'
  >('unknown');
  const [phoneInfo, setPhoneInfo] = useState<{
    phone?: string | null;
    profileName?: string | null;
    profilePictureUrl?: string | null;
  }>({});

  // QR Code pairing state
  const [qrCodeData, setQrCodeData] = useState<{
    base64?: string;
    code?: string;
    pairingCode?: string;
  } | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  // Computed Webhook URL
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      setWebhookUrl(`${origin}/api/webhooks/evolution`);
    }
  }, []);

  // Fetch saved configuration
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/evolution/config?live=true', { cache: 'no-store' });
      if (!res.ok) {
        setConnectionStatus('disconnected');
        return;
      }
      const data = await res.json();
      if (data.configured && data.config) {
        const c = data.config;
        setServerUrl(c.server_url || '');
        setApiKey(c.api_key || '');
        setInstanceName(c.instance_name || 'wacrm-main');
        setInstanceToken(c.instance_token || '');
        setAutoWebhook(c.auto_webhook ?? true);
        setRejectCalls(c.reject_calls ?? false);
        setAlwaysOnline(c.always_online ?? true);
        setReadMessages(c.read_messages ?? false);
        setConnectionStatus(c.status || 'disconnected');
        setPhoneInfo({
          phone: c.phone_number,
          profileName: c.profile_name,
          profilePictureUrl: c.profile_pic_url,
        });
      } else {
        setConnectionStatus('disconnected');
      }
    } catch {
      setConnectionStatus('unknown');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Test API Connection
  const handleTestConnection = async () => {
    if (!serverUrl) {
      toast.error('Please enter the Evolution API Server URL');
      return;
    }
    if (!apiKey) {
      toast.error('Please enter the Global API Key');
      return;
    }

    setTesting(true);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          server_url: serverUrl,
          api_key: apiKey,
          instance_name: instanceName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(data.message || 'Evolution API connection successful!');
        checkInstanceState();
      } else {
        toast.error(data.error || 'Failed to reach Evolution API server');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Network error testing connection');
    } finally {
      setTesting(false);
    }
  };

  // Check live instance state
  const checkInstanceState = async () => {
    setRefreshingState(true);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'state',
          server_url: serverUrl,
          api_key: apiKey,
          instance_name: instanceName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.state) {
        const s = data.state;
        if (s.state === 'open') {
          setConnectionStatus('connected');
          setPhoneInfo({
            phone: s.number || phoneInfo.phone,
            profileName: s.profileName,
            profilePictureUrl: s.profilePictureUrl,
          });
          setQrCodeData(null);
          toast.success('Instance is open and connected to WhatsApp!');
        } else if (s.state === 'connecting') {
          setConnectionStatus('connecting');
        } else {
          setConnectionStatus('disconnected');
        }
      }
    } catch {
      // Ignored
    } finally {
      setRefreshingState(false);
    }
  };

  // Fetch QR code
  const handleFetchQr = async () => {
    setLoadingQr(true);
    setQrCountdown(25);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          server_url: serverUrl,
          api_key: apiKey,
          instance_name: instanceName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.base64 || data.code) {
          setQrCodeData({
            base64: data.base64,
            code: data.code,
            pairingCode: data.pairingCode,
          });
          setConnectionStatus('qrcode_ready');
          toast.info('QR Code generated. Scan with WhatsApp to pair.');
        } else {
          // Might be already connected
          checkInstanceState();
        }
      } else {
        toast.error(data.error || 'Failed to generate QR Code');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error fetching QR Code');
    } finally {
      setLoadingQr(false);
    }
  };

  // Restart Instance
  const handleRestart = async () => {
    setRestarting(true);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restart',
          server_url: serverUrl,
          api_key: apiKey,
          instance_name: instanceName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success('Instance restart triggered. Waiting 5s before refresh...');
        setTimeout(() => {
          checkInstanceState();
        }, 5000);
      } else {
        toast.error(data.error || 'Failed to restart instance');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error restarting instance');
    } finally {
      setRestarting(false);
    }
  };

  // Disconnect / Logout
  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this WhatsApp instance?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'logout',
          server_url: serverUrl,
          api_key: apiKey,
          instance_name: instanceName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setConnectionStatus('disconnected');
        setQrCodeData(null);
        setPhoneInfo({});
        toast.success('WhatsApp instance disconnected');
      } else {
        toast.error(data.error || 'Failed to disconnect');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error disconnecting');
    } finally {
      setDisconnecting(false);
    }
  };

  // Set Webhook
  const handleSyncWebhook = async () => {
    try {
      const res = await fetch('/api/evolution/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-webhook',
          server_url: serverUrl,
          api_key: apiKey,
          instance_name: instanceName,
          webhook_url: webhookUrl,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(`Webhook set to ${webhookUrl}`);
      } else {
        toast.error(data.error || 'Failed to set webhook');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error setting webhook');
    }
  };

  // Save Config
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl) {
      toast.error('Evolution API Server URL is required');
      return;
    }
    if (!instanceName) {
      toast.error('Instance Name is required');
      return;
    }
    if (!apiKey) {
      toast.error('Global API Key is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/evolution/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_url: serverUrl,
          api_key: apiKey,
          instance_name: instanceName,
          instance_token: instanceToken,
          auto_webhook: autoWebhook,
          reject_calls: rejectCalls,
          always_online: alwaysOnline,
          read_messages: readMessages,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Evolution API configuration saved!');
        fetchConfig();
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Network error saving configuration');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      {/* Connection Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-10 items-center justify-center rounded-lg ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : connectionStatus === 'qrcode_ready' || connectionStatus === 'connecting'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <RadioTower className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {t('instanceStatusTitle')}
                  {connectionStatus === 'connected' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3" /> {t('connected')}
                    </span>
                  ) : connectionStatus === 'qrcode_ready' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <QrCode className="size-3" /> {t('waitingQr')}
                    </span>
                  ) : connectionStatus === 'connecting' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <Loader2 className="size-3 animate-spin" /> {t('connecting')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <XCircle className="size-3" /> {t('notConnected')}
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  {connectionStatus === 'connected'
                    ? t('connectedDesc')
                    : t('notConnectedDesc')}
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={checkInstanceState}
                disabled={refreshingState || !serverUrl}
              >
                {refreshingState ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCw className="size-3.5" />
                )}
                {t('refresh')}
              </Button>

              {connectionStatus === 'connected' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestart}
                    disabled={restarting}
                  >
                    {restarting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="size-3.5 text-amber-500" />
                    )}
                    {t('restart')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <PowerOff className="size-3.5" />
                    )}
                    {t('disconnect')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleFetchQr}
                  disabled={loadingQr || !serverUrl || !apiKey}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {loadingQr ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <QrCode className="size-3.5" />
                  )}
                  {t('connectQrBtn')}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Connected Details or QR Code View */}
        <CardContent className="border-t border-border pt-4">
          {connectionStatus === 'connected' ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg bg-muted/40 p-4 border border-border/50">
              <div className="flex items-center gap-3">
                {phoneInfo.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={phoneInfo.profilePictureUrl}
                    alt="WhatsApp Profile"
                    className="size-12 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Smartphone className="size-6" />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-sm text-foreground">
                    {phoneInfo.profileName || t('linkedWhatsAppAccount')}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="font-mono">{phoneInfo.phone || instanceName}</span>
                    <span>•</span>
                    <span className="text-emerald-600 font-medium">Active Session</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncWebhook}
                  className="text-xs h-8"
                >
                  <Webhook className="size-3 mr-1.5" />
                  {t('syncWebhook')}
                </Button>
              </div>
            </div>
          ) : qrCodeData ? (
            <div className="flex flex-col items-center justify-center p-6 bg-muted/20 border border-dashed rounded-xl gap-4">
              <div className="text-center max-w-md">
                <h4 className="font-semibold text-sm text-foreground mb-1">
                  {t('scanQrTitle')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t('scanQrInstructions')}
                </p>
              </div>

              {qrCodeData.base64 ? (
                <div className="p-3 bg-white rounded-xl shadow-md border border-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeData.base64}
                    alt="Evolution API QR Code"
                    className="size-60 object-contain"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-sm font-mono bg-muted rounded-lg">
                  {qrCodeData.code || 'Generating QR code...'}
                </div>
              )}

              {qrCodeData.pairingCode && (
                <div className="flex items-center gap-2 p-2 px-3 bg-primary/10 text-primary rounded-lg text-xs font-mono">
                  <span>Pairing code:</span>
                  <strong className="tracking-widest">{qrCodeData.pairingCode}</strong>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => copyToClipboard(qrCodeData.pairingCode!)}
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFetchQr}
                  disabled={loadingQr}
                >
                  <RotateCw className="size-3.5 mr-1.5" />
                  {t('refreshQr')}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={checkInstanceState}
                  disabled={refreshingState}
                >
                  <CheckCircle2 className="size-3.5 mr-1.5" />
                  {t('confirmScanned')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-2 py-1">
              <Server className="size-4 shrink-0 text-muted-foreground" />
              <span>
                {t('notConfiguredHint')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Settings Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('credentialsTitle')}</CardTitle>
          <CardDescription className="text-xs">
            {t('credentialsDesc')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="server_url" className="text-xs font-semibold">
                  {t('serverUrlLabel')} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="server_url"
                    placeholder="https://evolution.yourdomain.com or http://localhost:8080"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    disabled={!canEditSettings || saving}
                    className="font-mono text-xs pl-8"
                  />
                  <Server className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('serverUrlHint')}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api_key" className="text-xs font-semibold">
                  {t('apiKeyLabel')} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="api_key"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={t('apiKeyPlaceholder')}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={!canEditSettings || saving}
                    className="font-mono text-xs pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('apiKeyHint')}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="instance_name" className="text-xs font-semibold">
                  {t('instanceNameLabel')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="instance_name"
                  placeholder="wacrm-main"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  disabled={!canEditSettings || saving}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('instanceNameHint')}
                </p>
              </div>
            </div>

            {/* Advanced Behavior Toggles */}
            <div className="pt-3 border-t border-border space-y-3">
              <div className="text-xs font-semibold text-foreground mb-2">
                {t('behaviorSettingsTitle')}
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5 pr-4">
                  <div className="text-xs font-medium text-foreground">
                    {t('autoWebhookLabel')}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('autoWebhookDesc')}
                  </div>
                </div>
                <Switch
                  checked={autoWebhook}
                  onCheckedChange={setAutoWebhook}
                  disabled={!canEditSettings || saving}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5 pr-4">
                  <div className="text-xs font-medium text-foreground">
                    {t('alwaysOnlineLabel')}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('alwaysOnlineDesc')}
                  </div>
                </div>
                <Switch
                  checked={alwaysOnline}
                  onCheckedChange={setAlwaysOnline}
                  disabled={!canEditSettings || saving}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5 pr-4">
                  <div className="text-xs font-medium text-foreground">
                    {t('rejectCallsLabel')}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('rejectCallsDesc')}
                  </div>
                </div>
                <Switch
                  checked={rejectCalls}
                  onCheckedChange={setRejectCalls}
                  disabled={!canEditSettings || saving}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing || saving || !serverUrl || !apiKey}
              >
                {testing ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <Zap className="size-3.5 mr-1.5 text-primary" />
                )}
                {t('testConnectionBtn')}
              </Button>

              <Button
                type="submit"
                disabled={saving || !canEditSettings}
                size="sm"
                className="bg-primary text-primary-foreground font-medium"
              >
                {saving && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                {t('saveConfigBtn')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Webhook Endpoint Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="size-4 text-primary" />
            <CardTitle className="text-base">{t('webhookCardTitle')}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {t('webhookCardDesc')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{t('webhookUrlLabel')}</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="font-mono text-xs bg-muted/50 select-all"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl, 'Webhook URL copied')}
              >
                <Copy className="size-3.5 mr-1.5" />
                {t('copy')}
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
            <div className="font-medium text-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              {t('subscribedEventsTitle')}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'].map((ev) => (
                <span
                  key={ev}
                  className="inline-block rounded bg-background px-2 py-0.5 text-[10px] font-mono border border-border"
                >
                  {ev}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Guide & Docker-Compose Accordion */}
      <Accordion className="w-full">
        <AccordionItem className="border rounded-lg bg-card px-4">
          <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="size-4 text-primary" />
              <span>{t('guideTitle')}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-1 pb-4 text-xs text-muted-foreground">
            <p>
              {t('guideIntro')}
            </p>

            <div className="space-y-2">
              <div className="font-semibold text-foreground">1. Docker Compose Example</div>
              <div className="relative">
                <pre className="p-3 bg-neutral-950 text-neutral-200 rounded-lg font-mono text-[11px] overflow-x-auto">
{`version: '3.7'
services:
  evolution-api:
    image: atendai/evolution-api:v2.1.2
    container_name: evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=https://evolution.yourdomain.com
      - AUTHENTICATION_API_KEY=YOUR_SECURE_GLOBAL_API_KEY
      - DATABASE_ENABLED=false
      - WEBHOOK_GLOBAL_ENABLED=false
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  evolution_instances:`}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 size-7 text-neutral-400 hover:text-white"
                  onClick={() =>
                    copyToClipboard(
                      `version: '3.7'\nservices:\n  evolution-api:\n    image: atendai/evolution-api:v2.1.2\n    container_name: evolution_api\n    restart: always\n    ports:\n      - "8080:8080"\n    environment:\n      - SERVER_URL=https://evolution.yourdomain.com\n      - AUTHENTICATION_API_KEY=YOUR_SECURE_GLOBAL_API_KEY\n      - DATABASE_ENABLED=false\n      - WEBHOOK_GLOBAL_ENABLED=false\n    volumes:\n      - evolution_instances:/evolution/instances\n\nvolumes:\n  evolution_instances:`,
                      'Docker compose snippet copied',
                    )
                  }
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="font-semibold text-foreground">2. Quick Steps:</div>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>Deploy Evolution API on your VPS, Railway, Render, or Docker.</li>
                <li>Set an <code className="font-mono text-primary">AUTHENTICATION_API_KEY</code> in the environment.</li>
                <li>Paste your server URL and API key in the form above and click <strong>Save Configuration</strong>.</li>
                <li>Click <strong>Connect with QR Code</strong> and scan the code using WhatsApp on your phone.</li>
              </ol>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
