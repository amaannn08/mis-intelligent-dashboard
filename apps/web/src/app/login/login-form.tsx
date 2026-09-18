'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error?.message || data.error || 'Invalid credentials. Please try again.');
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
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-6 py-5 shadow-[0_1px_2px_rgba(26,24,21,0.04),0_1px_3px_rgba(26,24,21,0.06)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[#1A1815] dark:text-[#FAFAF8]">
          Log in to WEH MIS
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] px-2 py-[3px] text-[9px] font-mono uppercase tracking-[0.16em] text-[#5A5650] dark:text-[#9A958E]">
          <span
            className="inline-block h-[5px] w-[5px] rounded-full bg-[#3D7A58]"
            aria-hidden="true"
          />
          <span>Secure</span>
        </span>
      </div>

      {error && (
        <p
          className="mb-4 rounded-[10px] border border-[#FEE4E2] bg-[#FEF3F2] dark:border-[#5C1D18] dark:bg-[#2C1210] px-3 py-2 text-[11px] text-[#B42318] dark:text-[#F87171]"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mb-4">
        <label
          htmlFor="username"
          className="mb-1 block text-[11px] font-medium text-[#5A5650] dark:text-[#9A958E]"
        >
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          className="w-full rounded-[10px] border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] px-3.5 py-2.5 text-[13px] text-[#1A1815] dark:text-[#FAFAF8] placeholder:text-[#C8C3BB] dark:placeholder:text-[#5A5650] focus:outline-none focus:ring-1 focus:ring-[#FF7102]/50 focus:border-[#FF7102] disabled:opacity-50"
          placeholder="Login ID"
          autoComplete="username"
          autoFocus
          required
          disabled={isLoading}
        />
      </div>

      <div className="mb-5">
        <label
          htmlFor="password"
          className="mb-1 block text-[11px] font-medium text-[#5A5650] dark:text-[#9A958E]"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-[10px] border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8] dark:bg-[#141210] pl-3.5 pr-10 py-2.5 text-[13px] text-[#1A1815] dark:text-[#FAFAF8] placeholder:text-[#C8C3BB] dark:placeholder:text-[#5A5650] focus:outline-none focus:ring-1 focus:ring-[#FF7102]/50 focus:border-[#FF7102] disabled:opacity-50"
            placeholder="Password"
            autoComplete="current-password"
            required
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={isLoading}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9A958E] hover:text-[#1A1815] dark:hover:text-[#FAFAF8] focus:outline-none focus:text-[#1A1815] dark:focus:text-[#FAFAF8] p-1 rounded transition-colors cursor-pointer"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Eye className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-[9px] bg-[#1A1815] dark:bg-[#26231F] hover:bg-[#26231F] dark:hover:bg-[#332F2A] text-[13px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <span>{isLoading ? 'Signing in…' : 'Sign in'}</span>
      </button>

      <p className="mt-3 text-[10px] font-mono text-[#C8C3BB] dark:text-[#5A5650]">
        Internal tool · WEH team access only
      </p>
    </form>
  );
}
