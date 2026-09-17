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

  // Search companies debounce
  React.useEffect(() => {
    if (!commandOpen || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/companies?search=${encodeURIComponent(searchQuery)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.companies || []);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => clearTimeout(timer);
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
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col border-r border-border bg-card/60 backdrop-blur-md p-4 shrink-0 justify-between md:h-screen md:sticky md:top-0">
        <div className="space-y-6">
          {/* Logo & Terminal Badge */}
          <div className="flex items-center justify-between px-2 pt-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-wider">
                MIS
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight text-foreground leading-none">
                  WEH Ventures
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  Portfolio Intelligence
                </span>
              </div>
            </Link>
          </div>

          {/* Search Trigger Button */}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs text-muted-foreground transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span>Quick search…</span>
            </div>
            <kbd className="inline-flex items-center gap-0.5 font-mono text-[10px] bg-card px-1.5 py-0.5 rounded border border-border shadow-2xs">
              <Command className="w-2.5 h-2.5" /> K
            </kbd>
          </button>

          {/* Navigation Items */}
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
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors select-none',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: User + Theme + Logout */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-xs shrink-0 uppercase">
                {currentUser.slice(0, 2)}
              </div>
              <div className="truncate">
                <div className="text-xs font-medium text-foreground truncate">
                  {currentUser}
                </div>
                <div className="text-[10px] text-muted-foreground">Team Member</div>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-xs text-muted-foreground hover:text-destructive gap-2 h-8 px-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </Button>
        </div>
      </aside>

      {/* Mobile Topbar */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
            MIS
          </div>
          <span className="text-sm font-semibold text-foreground">Portfolio MIS</span>
        </Link>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label="Open command search"
            className="p-2 rounded-md hover:bg-muted text-muted-foreground"
          >
            <Search className="w-4 h-4" />
          </button>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="p-2 rounded-md hover:bg-muted text-muted-foreground"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-card p-4 space-y-3 animate-in slide-in-from-top-2">
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
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Logged in as {currentUser}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-xs h-7 gap-1"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main
        className={cn(
          'flex-1 min-w-0',
          noPadding
            ? 'h-[calc(100dvh-65px)] md:h-dvh flex flex-col overflow-hidden p-0'
            : 'overflow-x-hidden p-4 sm:p-6 lg:p-8'
        )}
      >
        {noPadding ? children : <div className="max-w-7xl mx-auto space-y-6">{children}</div>}
      </main>

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
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground ml-1" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search portfolio companies, metrics, or navigate…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden sm:inline-block font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-2 text-xs">
          {isSearching && (
            <div className="p-4 text-center text-muted-foreground">Searching companies…</div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
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
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-foreground">{comp.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {comp.industry || 'Portfolio Company'}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground opacity-40 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {/* Fast Navigation Shortcuts */}
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
              Navigation
            </div>
            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">Portfolio Overview</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">/</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/chat');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">AI Portfolio Chat</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">/chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/companies');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">Company Directory</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">/companies</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCommandOpen(false);
                router.push('/settings');
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted text-left cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">Diagnostics & Definitions</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">/settings</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
