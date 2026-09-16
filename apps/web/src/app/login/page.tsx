'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please provide both username and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Invalid credentials. Please try again.');
        return;
      }

      // Success: redirect to destination
      router.push(from);
      router.refresh();
    } catch {
      setError('Network error occurred during login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs animate-in fade-in"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-tight">{error}</span>
        </div>
      )}

      <Input
        label="Username"
        id="username"
        type="text"
        autoFocus
        autoComplete="username"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="e.g. wehcrm"
        disabled={isLoading}
      />

      <Input
        label="Password"
        id="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        disabled={isLoading}
      />

      <Button
        type="submit"
        className="w-full mt-2 font-medium"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            <span>Verifying credentials…</span>
          </>
        ) : (
          <>
            <span>Sign In</span>
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground relative selection:bg-primary/10">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm space-y-6">
        {/* Terminal Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground shadow-sm mb-1 font-bold text-lg">
            MIS
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Portfolio Intelligence
          </h1>
          <p className="text-xs text-muted-foreground">
            Sign in with your team credentials to access portfolio MIS data
          </p>
        </div>

        {/* Login Form Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <Suspense fallback={<div className="h-44 flex items-center justify-center text-xs text-muted-foreground">Loading login form…</div>}>
            <LoginForm />
          </Suspense>

          <div className="mt-5 pt-4 border-t border-border/60 text-center">
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-muted-foreground/80" />
              Secured team authentication
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
