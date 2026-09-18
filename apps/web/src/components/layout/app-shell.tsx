/* eslint-disable @next/next/no-img-element */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  LayoutDashboard,
  Building2,
  Settings,
  Search,
  Command,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  noPadding?: boolean;
}

interface CompanySearchResult {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  latestPeriod: string | null;
}

export function AppShell({ children, noPadding = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<CompanySearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState<string>('wehcrm');

  // Fetch session on mount
  React.useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.username) {
          setCurrentUser(data.user.username);
        }
      })
      .catch(() => {});
  }, []);

  // Global ⌘K / Ctrl+K listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Performance Fix 4: Search companies debounced 300ms, skip < 2 chars, AbortController
  React.useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!commandOpen || trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/companies?search=${encodeURIComponent(trimmed)}&limit=6`,
          { signal: abortController.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.companies || []);
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          console.error('Search failed:', err);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [searchQuery, commandOpen]);

  // Close mobile menu on route change
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  const navItems = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#FAFAF8] text-[#1A1815] dark:bg-[#141210] dark:text-[#FAFAF8] overflow-hidden">
      {/* Top Header bar */}
      <header className="z-20 border-b border-[#E8E5DE] dark:border-[#2E2A24] bg-[#FAFAF8]/95 dark:bg-[#141210]/95 backdrop-blur shrink-0">
        <div className="mx-auto flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
          {/* Brand Logo & Tagline */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              prefetch
              className="flex items-center gap-3 hover:opacity-85 transition-opacity"
            >
              <img
                src="/images/logo-black.svg"
                alt="WEH Ventures"
                className="w-24 dark:hidden"
              />
              <img
                src="/images/logo-white.svg"
                alt="WEH Ventures"
                className="w-24 hidden dark:block"
              />
              <span className="hidden sm:inline-block text-[10px] font-medium uppercase tracking-[0.22em] text-[#FF7102] font-mono">
                MIS Intelligence
              </span>
            </Link>
          </div>

          {/* Center/Right Actions: Quick search, user chip, logout, theme toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick search button */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="hidden md:flex items-center gap-2 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-3 py-1.5 text-xs text-[#5A5650] dark:text-[#9A958E] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors cursor-pointer shadow-xs"
            >
              <Search className="h-3.5 w-3.5 text-[#9A958E]" />
              <span className="text-[11px] font-medium">Quick search…</span>
              <kbd className="inline-flex items-center gap-0.5 rounded border border-[#E8E5DE] dark:border-[#2E2A24] bg-[#EEECE7] dark:bg-[#26231F] px-1.5 py-0.5 font-mono text-[9px] text-[#5A5650] dark:text-[#9A958E]">
                <Command className="h-2.5 w-2.5" /> K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Search"
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-[#5A5650] dark:text-[#9A958E]"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* User chip */}
            <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] px-2.5 py-1 text-[11px] font-mono text-[#5A5650] dark:text-[#9A958E] shadow-xs">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#FFD0AB] text-[10px] font-bold text-[#1A1815] uppercase">
                {currentUser.slice(0, 2)}
              </span>
              <span className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">{currentUser}</span>
            </div>

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-[#9A958E] hover:text-[#B42318] transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-[#5A5650] dark:text-[#9A958E]"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main App Body with Collapsible Sidebar Rail */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {/* Desktop Collapsible Sidebar (~228px rail) */}
        <aside
          className={cn(
            'hidden md:flex h-full shrink-0 flex-col border-r border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] transition-all duration-300 ease-in-out',
            isSidebarOpen
              ? 'w-[228px] translate-x-0'
              : 'w-0 -translate-x-full border-none overflow-hidden opacity-0'
          )}
        >
          <div className="flex-1 overflow-y-auto px-3 pb-4 pt-5 min-w-[228px] flex flex-col justify-between">
            <div className="space-y-4">
              {/* Section micro-label */}
              <div>
                <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                  Navigation
                </p>
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors select-none',
                          isActive
                            ? 'bg-[#FFEFE2] dark:bg-[#2D1F16]'
                            : 'hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[13px]',
                              isActive
                                ? 'bg-[#FFD0AB] text-[#FF7102]'
                                : 'bg-[#EEECE7] dark:bg-[#2E2A24] text-[#9A958E]'
                            )}
                            aria-hidden="true"
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span
                            className={cn(
                              'min-w-0 truncate text-[12px] font-semibold',
                              isActive
                                ? 'text-[#FF7102] dark:text-[#FFD0AB]'
                                : 'text-[#5A5650] dark:text-[#C8C3BB]'
                            )}
                          >
                            {item.label}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Sidebar Bottom micro-info */}
            <div className="border-t border-[#E8E5DE] dark:border-[#2E2A24] pt-3 px-2 text-[10px] text-[#C8C3BB] font-mono">
              <p className="truncate">Portfolio synced · MIS</p>
            </div>
          </div>
        </aside>

        {/* Floating round chevron toggle button that slides with the rail */}
        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={cn(
            'hidden md:flex absolute top-4 z-30 h-6 w-6 items-center justify-center rounded-full border border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] text-[#5A5650] dark:text-[#9A958E] shadow-sm hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-all duration-300 ease-in-out cursor-pointer',
            isSidebarOpen ? 'left-[216px]' : 'left-3'
          )}
          aria-label="Toggle sidebar"
        >
          {isSidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {/* Mobile Dropdown Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute inset-x-0 top-0 z-30 border-b border-[#E8E5DE] dark:border-[#2E2A24] bg-white dark:bg-[#1C1A17] p-4 shadow-lg space-y-4 animate-in slide-in-from-top-2">
            <p className="px-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
              Navigation
            </p>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors',
                      isActive
                        ? 'bg-[#FFEFE2] dark:bg-[#2D1F16] text-[#FF7102]'
                        : 'text-[#5A5650] dark:text-[#C8C3BB] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-[7px]',
                        isActive
                          ? 'bg-[#FFD0AB] text-[#FF7102]'
                          : 'bg-[#EEECE7] dark:bg-[#2E2A24] text-[#9A958E]'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-[#E8E5DE] dark:border-[#2E2A24] flex items-center justify-between text-xs">
              <span className="text-[11px] font-mono text-[#9A958E]">{currentUser}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-xs h-7 text-[#B42318] gap-1 hover:bg-[#FEF3F2]"
              >
                <LogOut className="h-3 w-3" />
                <span>Sign out</span>
              </Button>
            </div>
          </div>
        )}

        {/* Main Content Scroll Container */}
        <main className="relative flex min-h-0 flex-1 justify-center overflow-auto bg-[#FAFAF8] dark:bg-[#141210]">
          <div
            className={cn(
              'flex min-h-0 w-full flex-col pb-6',
              noPadding ? 'pt-0 px-0' : 'pt-4 px-4 sm:px-6'
            )}
          >
            <div className={cn(noPadding ? 'w-full h-full flex flex-col' : 'max-w-7xl mx-auto w-full space-y-4')}>
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* ⌘K Command Palette Modal */}
      <Modal
        isOpen={commandOpen}
        onClose={() => {
          setCommandOpen(false);
          setSearchQuery('');
        }}
        maxWidth="lg"
        className="p-0 overflow-hidden"
      >
        <div className="p-3 border-b border-[#E8E5DE] dark:border-[#2E2A24] flex items-center gap-2 bg-[#FAFAF8] dark:bg-[#141210]">
          <Search className="w-4 h-4 text-[#9A958E] ml-1" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search portfolio companies, filings, or metrics…"
            className="w-full bg-transparent text-xs text-[#1A1815] dark:text-[#FAFAF8] placeholder:text-[#9A958E] focus:outline-none font-sans"
          />
          <kbd className="hidden sm:inline-block font-mono text-[10px] bg-[#EEECE7] dark:bg-[#26231F] px-1.5 py-0.5 rounded border border-[#E8E5DE] dark:border-[#2E2A24] text-[#5A5650] dark:text-[#9A958E]">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-2 text-xs bg-white dark:bg-[#1C1A17]">
          {isSearching && (
            <div className="p-4 text-center text-[#9A958E] text-xs font-mono">
              Searching companies…
            </div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
                Companies
              </div>
              {searchResults.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => {
                    setCommandOpen(false);
                    router.push(`/companies/${comp.slug}`);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-6 w-6 rounded-[6px] bg-[#EEECE7] dark:bg-[#2E2A24] flex items-center justify-center font-mono font-semibold text-[10px] text-[#5A5650] dark:text-[#9A958E]">
                      {comp.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <div className="font-semibold text-[#1A1815] dark:text-[#FAFAF8]">{comp.name}</div>
                      <div className="text-[10px] text-[#9A958E] font-mono">
                        {comp.industry || 'Portfolio Company'}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#9A958E]" />
                </button>
              ))}
            </div>
          )}

          {/* Fast Navigation Shortcuts */}
          <div className="space-y-1 pt-1 border-t border-[#E8E5DE] dark:border-[#2E2A24]">
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono">
              Navigation
            </div>
            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-3.5 h-3.5 text-[#9A958E]" />
                <span className="font-medium text-[#1A1815] dark:text-[#FAFAF8]">Portfolio Overview</span>
              </div>
              <span className="text-[10px] text-[#9A958E] font-mono">/</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/companies');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-3.5 h-3.5 text-[#9A958E]" />
                <span className="font-medium text-[#1A1815] dark:text-[#FAFAF8]">Company Directory</span>
              </div>
              <span className="text-[10px] text-[#9A958E] font-mono">/companies</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/chat');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#9A958E]" />
                <span className="font-medium text-[#1A1815] dark:text-[#FAFAF8]">AI Portfolio Chat</span>
              </div>
              <span className="text-[10px] text-[#9A958E] font-mono">/chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/settings');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-3.5 h-3.5 text-[#9A958E]" />
                <span className="font-medium text-[#1A1815] dark:text-[#FAFAF8]">Diagnostics & Settings</span>
              </div>
              <span className="text-[10px] text-[#9A958E] font-mono">/settings</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
