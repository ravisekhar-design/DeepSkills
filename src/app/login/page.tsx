"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BrainCircuit, Loader2, MailCheck, ArrowLeft,
  RefreshCw, ShieldCheck, Lock, Eye, EyeOff,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

type Step = "credentials" | "otp";

const OTP_TTL_SECONDS = 600; // must match server (10 min)

export default function LoginPage() {
  const [otpEnabled, setOtpEnabled]     = useState<boolean | null>(null);
  const [step, setStep]                 = useState<Step>("credentials");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode]           = useState("");
  const [loading, setLoading]           = useState(false);
  const [resending, setResending]       = useState(false);
  const [autofilled, setAutofilled]     = useState(false);
  const [timeLeft, setTimeLeft]         = useState(OTP_TTL_SECONDS);

  const emailRef    = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const otpRef      = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const { toast } = useToast();

  // ── Pre-fetch OTP configuration ───────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/otp-status")
      .then(r => r.json())
      .then(d => setOtpEnabled(!!d.enabled))
      .catch(() => setOtpEnabled(false));
  }, []);

  // ── Show toast when redirected here after session timeout ─────────────
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "timeout") {
      toast({
        title: "Session expired",
        description: "You were automatically signed out after 30 minutes of inactivity.",
      });
      // Remove the query param from the URL without a full reload
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  // ── Autofill detection ────────────────────────────────────────────────
  // Password managers fill DOM inputs without firing React onChange.
  // Poll the DOM after mount and sync values into React state.
  useEffect(() => {
    const sync = () => {
      const emailVal    = emailRef.current?.value;
      const passwordVal = passwordRef.current?.value;
      if (emailVal && !email)    { setEmail(emailVal);       setAutofilled(true); }
      if (passwordVal && !password) { setPassword(passwordVal); setAutofilled(true); }
    };
    // Check at 300 ms, 700 ms, 1500 ms — covers slow password managers
    const timers = [
      setTimeout(sync, 300),
      setTimeout(sync, 700),
      setTimeout(sync, 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []); // run once on mount

  // ── OTP countdown timer ───────────────────────────────────────────────
  useEffect(() => {
    if (step !== "otp") return;
    setTimeLeft(OTP_TTL_SECONDS);
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Shared helpers ────────────────────────────────────────────────────
  // Read actual DOM values at submit time — captures password-manager fills
  const getInputValues = () => ({
    emailVal:    emailRef.current?.value    || email,
    passwordVal: passwordRef.current?.value || password,
  });

  const sendOtp = useCallback(async (emailVal: string, passwordVal: string) => {
    const res  = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailVal, password: passwordVal }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw Object.assign(new Error(data.message || "Failed to send OTP"), { status: res.status });
    }
    return data;
  }, []);

  // ── Step 1 — credentials submit ───────────────────────────────────────
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { emailVal, passwordVal } = getInputValues();

    try {
      if (otpEnabled) {
        await sendOtp(emailVal, passwordVal);
        setEmail(emailVal);
        setPassword(passwordVal);
        setOtpCode("");
        setStep("otp");
        setTimeout(() => otpRef.current?.focus(), 100);
        toast({ title: "Code sent", description: `Check ${emailVal} for your 6-digit code.` });
      } else {
        // Direct sign-in (SMTP not configured — dev / local only)
        await doSignIn(emailVal, passwordVal);
      }
    } catch (err: any) {
      toast({
        title:       err.status === 401 ? "Incorrect credentials" : "Could not send code",
        description: err.message || "Please try again.",
        variant:     "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 — OTP submit ───────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) return;
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        otpToken: otpCode,
      });
      if (res?.error) {
        toast({
          title:       "Invalid code",
          description: "The code is incorrect or has expired. Try resending.",
          variant:     "destructive",
        });
        setOtpCode("");
        otpRef.current?.focus();
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      toast({ title: "Error", description: "Unexpected error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────
  const handleResend = async () => {
    setResending(true);
    try {
      await sendOtp(email, password);
      setOtpCode("");
      setTimeLeft(OTP_TTL_SECONDS);
      otpRef.current?.focus();
      toast({ title: "New code sent", description: `Check ${email} for a fresh code.` });
    } catch (err: any) {
      toast({ title: "Resend failed", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  // ── Direct sign-in (no OTP) ───────────────────────────────────────────
  const doSignIn = async (emailVal: string, passwordVal: string) => {
    const res = await signIn("credentials", {
      redirect: false,
      email:    emailVal,
      password: passwordVal,
    });
    if (res?.error) {
      toast({ title: "Incorrect credentials", description: "Invalid email or password.", variant: "destructive" });
    } else {
      router.push("/");
      router.refresh();
    }
  };

  // ── Loading spinner while fetching OTP status ─────────────────────────
  if (otpEnabled === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent opacity-40" />
      </div>
    );
  }

  // ── Step indicator ────────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="flex items-center gap-2 justify-center mb-8">
      {/* Step 1 dot */}
      <div className={`h-2 w-2 rounded-full transition-colors ${step === "credentials" ? "bg-accent scale-125" : "bg-accent"}`} />
      {/* Connector */}
      <div className={`h-px w-10 transition-colors ${step === "otp" ? "bg-accent" : "bg-border"}`} />
      {/* Step 2 dot */}
      <div className={`h-2 w-2 rounded-full transition-colors ${step === "otp" ? "bg-accent scale-125" : "bg-border"}`} />
      <span className="ml-2 text-[11px] text-muted-foreground font-medium tracking-widest uppercase">
        Step {step === "credentials" ? "1" : "2"} of {otpEnabled ? "2" : "1"}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20">
            <BrainCircuit className="h-7 w-7 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DeepSkill Nexus</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Secure cognitive laboratory</p>
          </div>
        </div>

        {otpEnabled && <StepIndicator />}

        {/* ── STEP 1: Credentials ── */}
        {step === "credentials" && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold">Sign in</h2>
              <p className="text-sm text-muted-foreground">
                {otpEnabled
                  ? "Enter your credentials — we'll email you a verification code."
                  : "Enter your credentials to access your workspace."}
              </p>
            </div>

            <form onSubmit={handleCredentialsSubmit} autoComplete="on" className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Email
                </Label>
                <Input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setAutofilled(false); }}
                  className="h-11 bg-secondary/30"
                  required
                  autoFocus
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setAutofilled(false); }}
                    className="h-11 bg-secondary/30 pr-10"
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Autofill indicator */}
              {autofilled && (
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Credentials filled from your password manager
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 gradient-copper font-semibold shadow-lg shadow-accent/20"
                disabled={loading}
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{otpEnabled ? "Sending code…" : "Signing in…"}</>
                  : otpEnabled
                    ? <><MailCheck className="h-4 w-4 mr-2" />Continue — Send verification code</>
                    : <><Lock className="h-4 w-4 mr-2" />Sign in</>
                }
              </Button>
            </form>

            {/* Security badge */}
            {otpEnabled && (
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-green-500" />
                Two-factor authentication enabled
              </div>
            )}

            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link href="/register" className="text-accent underline hover:text-accent/80 font-medium">
                Register here
              </Link>
            </p>
          </div>
        )}

        {/* ── STEP 2: OTP ── */}
        {step === "otp" && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-accent/10 border border-accent/20">
                <MailCheck className="h-6 w-6 text-accent" />
              </div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit code to{" "}
                <span className="font-semibold text-foreground">{email}</span>
              </p>
            </div>

            <form onSubmit={handleOtpSubmit} autoComplete="off" className="space-y-4">
              {/* OTP input */}
              <div className="space-y-1.5">
                <Label htmlFor="otp" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Verification code
                </Label>
                <Input
                  ref={otpRef}
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-14 text-center text-3xl font-mono tracking-[0.6em] bg-secondary/30"
                  autoFocus
                  required
                />
              </div>

              {/* Countdown */}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                <span>
                  {timeLeft > 0
                    ? <>Expires in <span className={`font-mono font-semibold ${timeLeft < 60 ? "text-destructive" : "text-foreground"}`}>{formatTime(timeLeft)}</span></>
                    : <span className="text-destructive font-medium">Code expired — resend below</span>}
                </span>
                <span>Check spam folder too</span>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 gradient-copper font-semibold shadow-lg shadow-accent/20"
                disabled={loading || otpCode.length !== 6 || timeLeft === 0}
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Verifying…</>
                  : <><ShieldCheck className="h-4 w-4 mr-2" />Verify &amp; Sign In</>
                }
              </Button>
            </form>

            {/* Back / Resend */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => { setStep("credentials"); setOtpCode(""); }}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={handleResend}
                disabled={resending}
              >
                {resending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending…</>
                  : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Resend code</>
                }
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
