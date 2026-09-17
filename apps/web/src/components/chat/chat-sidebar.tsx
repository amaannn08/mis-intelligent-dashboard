'use client';

import * as React from 'react';
import type { ChatSessionSummary } from './chat-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  Plus,
  MessageSquare,
  Edit2,
  Trash2,
  Check,
  X,
  PanelLeftClose,
  Calendar,
} from 'lucide-react';

interface ChatSidebarProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, newTitle: string) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  className?: string;
}

import { formatRelativeTime, groupSessions } from './chat-helpers';

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  className,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [sessionToDelete, setSessionToDelete] = React.useState<ChatSessionSummary | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const editInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (e: React.MouseEvent, session: ChatSessionSummary) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingId) return;

    const trimmed = editTitle.trim();
    if (trimmed) {
      await onRenameSession(editingId, trimmed);
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, session: ChatSessionSummary) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteSession(sessionToDelete.id);
      setSessionToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const { today, yesterday, earlier } = groupSessions(sessions);

  const renderSessionGroup = (title: string, groupSessions: ChatSessionSummary[]) => {
    if (groupSessions.length === 0) return null;

    return (
      <div className="space-y-1">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Calendar className="w-3 h-3 opacity-60" />
          <span>{title}</span>
        </div>

        {groupSessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isEditing = session.id === editingId;

          return (
            <div
              key={session.id}
              onClick={() => {
                if (!isEditing) {
                  onSelectSession(session.id);
                  onCloseMobile();
                }
              }}
              className={cn(
                'group relative flex flex-col gap-1 p-2.5 rounded-lg text-left transition-colors cursor-pointer select-none border',
                isActive
                  ? 'bg-primary/10 border-primary/20 text-foreground font-medium shadow-2xs'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {/* Row Top: Title (or input if editing) and Hover Actions */}
              <div className="flex items-center justify-between gap-1">
                {isEditing ? (
                  <form
                    onSubmit={handleSaveRename}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 w-full"
                  >
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full bg-background border border-ring text-xs text-foreground px-1.5 py-0.5 rounded focus:outline-none"
                    />
                    <button
                      type="submit"
                      aria-label="Save title"
                      className="p-1 text-primary hover:bg-muted rounded cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel renaming"
                      onClick={handleCancelRename}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="text-xs font-medium text-foreground truncate block flex-1">
                      {session.title || 'New chat'}
                    </span>

                    {/* Action buttons revealed on group hover or focus */}
                    <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                      <button
                        type="button"
                        aria-label={`Rename session ${session.title}`}
                        onClick={(e) => handleStartRename(e, session)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                        title="Rename conversation"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete session ${session.title}`}
                        onClick={(e) => handleDeleteClick(e, session)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-card transition-colors cursor-pointer"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Row Bottom: Scope badge and Relative time */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground gap-2 pt-0.5">
                <Badge
                  variant={session.companyName ? 'secondary' : 'outline'}
                  className="text-[9px] px-1.5 py-0 h-4 font-normal truncate max-w-[150px]"
                >
                  {session.companyName || 'All portfolio'}
                </Badge>
                <span className="font-mono shrink-0">{formatRelativeTime(session.updatedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-md">
      {/* Header with New Chat & Collapse Toggle */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Conversations
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop collapse toggle */}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse conversations sidebar"
              className="hidden md:flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close conversations drawer"
              className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* New Chat Button */}
        <Button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          size="sm"
          className="w-full justify-center gap-1.5 text-xs h-8 shadow-2xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New chat</span>
        </Button>
      </div>

      {/* Session list area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {sessions.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="text-xs font-medium text-foreground">No conversations yet</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Start a new chat to ask questions across your portfolio MIS database.
            </p>
          </div>
        ) : (
          <>
            {renderSessionGroup('Today', today)}
            {renderSessionGroup('Yesterday', yesterday)}
            {renderSessionGroup('Earlier', earlier)}
          </>
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-border/80 text-[11px] text-muted-foreground flex items-center justify-between bg-muted/20">
        <span>{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
        <span className="font-mono text-[10px]">MIS DB v1</span>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Conversation"
        description={`Are you sure you want to permanently delete "${sessionToDelete?.title}"? All messages and conversation history will be removed.`}
        confirmLabel="Delete Conversation"
        variant="destructive"
        isLoading={isDeleting}
      />
    </div>
  );

  return (
    <>
      {/* Desktop Rail (280px or collapsed) */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border h-full shrink-0 transition-all duration-200 overflow-hidden',
          isCollapsed ? 'w-0 border-r-0' : 'w-[280px]',
          className
        )}
      >
        {!isCollapsed && sidebarContent}
      </aside>

      {/* Mobile Slide-over Drawer */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          <div className="fixed inset-y-0 left-0 max-w-full flex">
            <div className="w-72 bg-card border-r border-border shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
              {sidebarContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
