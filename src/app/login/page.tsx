"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BrainCircuit, Loader2, MailCheck,
  ArrowLeft, RefreshCw, ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

type Step = "credentials" | "otp";

export default function LoginPage() {
  const [otpEnabled, setOtpEnabled] = useState<boolean | null>(null); // null = loading
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Pre-fetch OTP configuration status once on mount
  useEffect(() => {
    fetch("/api/auth/otp-status")
      .then(r => r.json())
      .then(data => setOtpEnabled(!!data.enabled))
      .catch(() => setOtpEnabled(false));
  }, []);

  // ── Step 1 — credentials ──────────────────────────────────────────────
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (otpEnabled) {
        // OTP path: send code then advance to step 2
        const res = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast({
            title: res.status === 401 ? "Authentication Failed" : "Send Failed",
            description: data.message || "Could not send OTP. Please try again.",
            variant: "destructive",
          });
          return;
        }

        setOtpCode("");
        setStep("otp");
        toast({
          title: "Code Sent",
          description: `A 6-digit code was sent to ${email}.`,
        });
      } else {
        // Direct sign-in (SMTP not configured)
        await doSignIn(email, password);
      }
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 — OTP verify ───────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter the 6-digit code from your email.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        otpToken: otpCode,
      });
      if (res?.error) {
        toast({
          title: "Verification Failed",
          description: "The code is invalid or has expired. Please try again.",
          variant: "destructive",
        });
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────
  const handleResend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        setOtpCode("");
        toast({ title: "Code Resent", description: `A new code was sent to ${email}.` });
      } else {
        const data = await res.json();
        toast({
          title: "Failed to Resend",
          description: data.message || "Please try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Could not resend code.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  // ── Shared direct sign-in ─────────────────────────────────────────────
  const doSignIn = async (emailVal: string, passwordVal: string) => {
    const res = await signIn("credentials", {
      redirect: false,
      email: emailVal,
      password: passwordVal,
    });
    if (res?.error) {
      toast({
        title: "Authentication Failed",
        description: "Invalid email or password.",
        variant: "destructive",
      });
    } else {
      router.push("/");
      router.refresh();
    }
  };

  // ── Loading state while fetching OTP status ───────────────────────────
  if (otpEnabled === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent opacity-40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">

        {/* Logo */}
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20">
            <BrainCircuit className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">DeepSkill Nexus</h1>
          <p className="text-muted-foreground">Secure access to your cognitive laboratory.</p>
        </div>

        {/* ── Step 1: Credentials ── */}
        {step === "credentials" && (
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Operator Sign In</CardTitle>
                  <CardDescription>Enter your credentials to access your agents.</CardDescription>
                </div>
                {otpEnabled && (
                  <div className="flex items-center gap-1 text-[10px] text-green-500 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1">
                    <ShieldCheck className="h-3 w-3" />
                    OTP Enabled
                  </div>
                )}
              </div>
            </CardHeader>
            <form onSubmit={handleCredentialsSubmit} autoComplete="on">
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="nexus@local.network"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {loading
                    ? (otpEnabled ? "Sending code..." : "Signing in...")
                    : (otpEnabled ? "Continue → Verify by Email" : "Sign In")}
                </Button>
                <div className="text-center text-sm text-muted-foreground w-full">
                  Don&apos;t have an operator profile?{" "}
                  <Link href="/register" className="text-accent underline hover:text-accent/80">
                    Register here
                  </Link>
                </div>
              </CardFooter>
            </form>
          </Card>
        )}

        {/* ── Step 2: OTP ── */}
        {step === "otp" && (
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 shrink-0">
                  <MailCheck className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Check Your Email</CardTitle>
                  <CardDescription className="mt-0.5">
                    We sent a 6-digit code to{" "}
                    <span className="font-medium text-foreground">{email}</span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <form onSubmit={handleOtpSubmit} autoComplete="off">
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">One-Time Code</Label>
                  <Input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    autoFocus
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The code expires in 10 minutes. Check your spam folder if you don&apos;t see it.
                </p>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={loading || otpCode.length !== 6}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {loading ? "Verifying..." : "Verify & Sign In"}
                </Button>
                <div className="flex w-full items-center justify-between text-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { setStep("credentials"); setOtpCode(""); }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={handleResend}
                    disabled={resending}
                  >
                    {resending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Resend code
                  </Button>
                </div>
              </CardFooter>
            </form>
          </Card>
        )}

      </div>
    </div>
  );
}
