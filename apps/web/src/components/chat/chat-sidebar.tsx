'use client';

import * as React from 'react';
import type { ChatSessionSummary } from './chat-types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  PanelLeftClose,
  Calendar,
} from 'lucide-react';
import { formatRelativeTime, groupSessions } from './chat-helpers';

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
        <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#C8C3BB] font-mono flex items-center gap-1.5">
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
                'group relative flex flex-col gap-1 p-2.5 rounded-xl text-left transition-colors cursor-pointer select-none border',
                isActive
                  ? 'bg-[#FFEFE2] dark:bg-[#2D1F16] border-[#FFD0AB] dark:border-[#FF7102]/40 text-[#1A1815] dark:text-[#FAFAF8] shadow-xs'
                  : 'border-transparent text-[#5A5650] dark:text-[#9A958E] hover:text-[#1A1815] dark:hover:text-[#FAFAF8] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F]'
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
                      className="w-full bg-white dark:bg-[#1C1A17] border border-[#FF7102] text-xs text-[#1A1815] dark:text-[#FAFAF8] px-2 py-0.5 rounded-lg focus:outline-none font-sans"
                    />
                    <button
                      type="submit"
                      aria-label="Save title"
                      className="p-1 text-[#FF7102] hover:bg-[#F5F4F0] rounded cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel renaming"
                      onClick={handleCancelRename}
                      className="p-1 text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0] rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-[#1A1815] dark:text-[#FAFAF8] truncate block flex-1">
                      {session.title || 'New chat'}
                    </span>

                    {/* Action buttons revealed on group hover or focus */}
                    <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                      <button
                        type="button"
                        aria-label={`Rename session ${session.title}`}
                        onClick={(e) => handleStartRename(e, session)}
                        className="p-1 rounded text-[#9A958E] hover:text-[#1A1815] hover:bg-white dark:hover:bg-[#1C1A17] transition-colors cursor-pointer"
                        title="Rename conversation"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete session ${session.title}`}
                        onClick={(e) => handleDeleteClick(e, session)}
                        className="p-1 rounded text-[#9A958E] hover:text-[#B42318] hover:bg-white dark:hover:bg-[#1C1A17] transition-colors cursor-pointer"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Row Bottom: Scope badge and Relative time */}
              <div className="flex items-center justify-between text-[10px] text-[#9A958E] gap-2 pt-0.5">
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-[4px] font-mono uppercase tracking-[0.06em] truncate max-w-[140px]',
                    session.companyName
                      ? 'bg-[#E8EEF7] dark:bg-[#1A2636] text-[#3A5F8C] dark:text-[#7EA5D9]'
                      : 'bg-[#EEECE7] dark:bg-[#26231F] text-[#5A5650] dark:text-[#9A958E]'
                  )}
                >
                  {session.companyName || 'Portfolio'}
                </span>
                <span className="font-mono shrink-0 text-[10px]">{formatRelativeTime(session.updatedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-[#1C1A17]">
      {/* Header with New Chat & Collapse Toggle */}
      <div className="p-3 border-b border-[#E8E5DE] dark:border-[#2E2A24] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-[6px] bg-[#FFD0AB] dark:bg-[#2D1F16] text-[#FF7102] flex items-center justify-center font-mono font-bold text-[11px]">
              AI
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1A1815] dark:text-[#FAFAF8] font-mono">
              Sessions
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse conversations sidebar"
            className="hidden md:flex p-1.5 rounded-lg text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0] dark:hover:bg-[#26231F] transition-colors cursor-pointer"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#FF7102] hover:bg-[#ff8a3a] text-white py-2 text-xs font-semibold shadow-[0_4px_14px_rgba(255,113,2,0.25)] transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Sessions List grouped by date */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#9A958E] font-mono italic">
            No past conversations. Click &quot;New Chat&quot; to begin.
          </div>
        ) : (
          <>
            {renderSessionGroup('Today', today)}
            {renderSessionGroup('Yesterday', yesterday)}
            {renderSessionGroup('Earlier', earlier)}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={Boolean(sessionToDelete)}
        onClose={() => setSessionToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Conversation"
        description={`Are you sure you want to delete "${sessionToDelete?.title}"? All messages and citations in this session will be permanently removed.`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar Rail */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-[#E8E5DE] dark:border-[#2E2A24] h-full shrink-0 transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-0 overflow-hidden border-none opacity-0' : 'w-64 opacity-100',
          className
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Overlay) */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-[#1C1A17] shadow-xl animate-in slide-in-from-left duration-200">
            <div className="absolute top-2 right-2 z-10">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close conversation drawer"
                className="p-1.5 rounded-lg text-[#9A958E] hover:text-[#1A1815] hover:bg-[#F5F4F0]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
