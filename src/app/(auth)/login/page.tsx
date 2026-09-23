"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, UsersRound } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("wacrm_demo_mode");
        document.cookie = "wacrm_demo_mode=; path=/; max-age=0; SameSite=None; Secure";
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) {
        setError(signInErr.message);
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined") {
        document.cookie = "wacrm_auth=true; path=/; max-age=604800; SameSite=None; Secure";
      }

      const destination = inviteToken
        ? `/join/${encodeURIComponent(inviteToken)}`
        : "/dashboard";
      window.location.href = destination;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      setLoading(false);
    }
  };

  const enterDemoMode = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wacrm_demo_mode", "true");
      document.cookie = "wacrm_demo_mode=true; path=/; max-age=604800; SameSite=None; Secure";
      window.location.href = "/dashboard";
    }
  };

  const quickFillUser = (fillEmail: string) => {
    setEmail(fillEmail);
    setPassword("Password123!");
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {inviteToken ? (
              <UsersRound className="h-6 w-6 text-primary" />
            ) : (
              <MessageSquare className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl text-foreground">
            {inviteToken ? t('titleAccept') : t('titleWelcome')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken
              ? t('descAccept')
              : t('descWelcome')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-muted-foreground">
                {t('emailLabel')}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-muted-foreground">
                  {t('passwordLabel')}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? t('signingIn') : t('signIn')}
            </Button>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              <p className="mb-2 font-medium text-foreground">Click to fill verified credentials:</p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => quickFillUser("shortsreels629@gmail.com")}
                  className="flex items-center justify-between rounded bg-muted/80 px-2.5 py-1.5 text-left text-xs font-mono text-foreground hover:bg-muted"
                >
                  <span className="truncate">shortsreels629@gmail.com</span>
                  <span className="text-[10px] text-primary font-sans font-semibold">Use</span>
                </button>
                <button
                  type="button"
                  onClick={() => quickFillUser("luluecom6@gmail.com")}
                  className="flex items-center justify-between rounded bg-muted/80 px-2.5 py-1.5 text-left text-xs font-mono text-foreground hover:bg-muted"
                >
                  <span className="truncate">luluecom6@gmail.com</span>
                  <span className="text-[10px] text-primary font-sans font-semibold">Use</span>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Password: <code className="text-foreground">Password123!</code></p>
            </div>

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or test without Supabase</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={enterDemoMode}
              className="h-10 w-full border-primary/30 text-foreground hover:bg-primary/10 font-medium"
            >
              🚀 Explore Demo CRM Dashboard
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('noAccount')}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="text-primary hover:text-primary/80"
            >
              {t('createAccount')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
