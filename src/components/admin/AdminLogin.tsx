"use client";

import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type React from "react";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import type { AdminUser, LoginForm } from "@/types/admin";
import { toast } from "sonner";

interface AdminLoginProps {
  onLoginSuccess: (admin: AdminUser) => void;
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const { login } = useAdminAuth();
  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: "",
    password: "",
    showPassword: false,
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    remaining: number;
    resetTime: Date | null;
    maxAttempts: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const emailHint = urlParams.get("email");
    if (emailHint) setLoginForm((p) => ({ ...p, email: emailHint }));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setRateLimitInfo(null);

    const { email, password } = loginForm;

    try {
      const result = await login(email, password, rememberMe);
      if (result.success) {
        onLoginSuccess(result.admin); // ← use admin from the result (fresh), not a stale hook read
        toast.success("Successfully logged in!");
      } else {
        const errorMessage = result.error || "Invalid credentials or not an admin";
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } catch (error: any) {
      let errorMessage = "Login failed. Please try again.";

      // Handle rate limiting specifically
      if (error?.status === 429 || error?.response?.status === 429) {
        const rateLimitData = error.response?.data || error.data;
        if (rateLimitData) {
          errorMessage = rateLimitData.error;
          setRateLimitInfo({
            remaining: rateLimitData.remainingAttempts || 0,
            resetTime: rateLimitData.resetTime ? new Date(rateLimitData.resetTime) : null,
            maxAttempts: rateLimitData.maxAttempts || 5,
          });
        } else {
          errorMessage = "Too many login attempts. Please wait before trying again.";
        }
      }

      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-primary/5 flex items-center dark:bg-[#121212] justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Admin Panel</h1>
          <p className="text-muted-foreground">Sign in to manage feature requests</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl p-8 border border-border">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full pl-11 pr-4 py-3 border border-input bg-background rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground placeholder:text-muted-foreground"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type={loginForm.showPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="w-full pl-11 pr-11 py-3 border border-input bg-background rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground placeholder:text-muted-foreground"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() =>
                    setLoginForm((prev) => ({
                      ...prev,
                      showPassword: !prev.showPassword,
                    }))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-foreground"
                >
                  {loginForm.showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="rememberMe" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(checked === true)} />
              <label htmlFor="rememberMe" className="text-sm text-foreground cursor-pointer">
                Remember me for 30 days
              </label>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                <p className="text-destructive text-sm">{error}</p>
                {rateLimitInfo && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {rateLimitInfo.remaining > 0 ? (
                      <p>{rateLimitInfo.remaining} attempts remaining</p>
                    ) : (
                      <p>
                        Rate limit exceeded. Try again{" "}
                        {rateLimitInfo.resetTime && <span className="font-medium">{new Date(rateLimitInfo.resetTime).toLocaleTimeString()}</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary py-3 px-4 rounded-xl font-medium hover:opacity-90 focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all shadow-lg disabled:opacity-50 text-white"
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
