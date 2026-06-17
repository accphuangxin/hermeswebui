import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, MessageSquare, Pencil, Download } from "lucide-react";
import type { ChatSession } from "@/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type SidebarTab = "chat" | "cron";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession?: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onExportSession?: (id: string) => void;
  isLocked?: boolean;
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onExportSession,
  isLocked,
}: ChatSidebarProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: ChatSession } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handle = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [contextMenu]);

  const startRename = (session: ChatSession) => {
    setEditingId(session.id);
    setEditValue(session.title || "");
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRenameSession(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full w-56 border-r bg-muted/30">
      <div className="p-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onNewSession}
          disabled={!onNewSession || isLocked}
        >
          <Plus className="w-4 h-4" />
          {t("hermes.chat.newSession")}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5 select-none">
          {sessions.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              {t("hermes.chat.noSessions")}
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => !isLocked && onSelectSession(s.id)}
              onDoubleClick={() => !isLocked && startRename(s)}
              onMouseDown={(e) => { if (e.button === 2) e.preventDefault(); }}
              onContextMenu={(e) => {
                e.preventDefault();
                window.getSelection()?.removeAllRanges();
                setContextMenu({ x: e.clientX, y: e.clientY, session: s });
              }}
              className={cn(
                "group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors select-none",
                activeSessionId === s.id && "bg-muted font-medium",
                isLocked && s.id !== activeSessionId && "opacity-40 cursor-not-allowed",
              )}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              {editingId === s.id ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 bg-background border rounded px-1 py-0 text-sm outline-none"
                  autoFocus
                />
              ) : (
                <span className="flex-1 truncate">
                  {s.title || t("hermes.chat.untitled")}
                </span>
              )}
              {editingId !== s.id && onExportSession && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportSession(s.id);
                  }}
                  className="p-0.5 hover:text-foreground text-muted-foreground/40"
                  title={t("hermes.chat.exportSession", { defaultValue: "导出为 Markdown" })}
                >
                  <Download className="w-3 h-3" />
                </button>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Session context menu (right-click) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[140px] rounded-md border bg-popover shadow-md py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left"
            onClick={() => {
              startRename(contextMenu.session);
              setContextMenu(null);
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {t("hermes.chat.rename")}
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left text-destructive"
            onClick={() => {
              setDeletingId(contextMenu.session.id);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("hermes.chat.deleteSession", { defaultValue: "删除" })}
          </button>
        </div>
      )}

      {/* Delete confirm dialog */}
      <Dialog
        open={!!deletingId}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <DialogContent
          className="sm:max-w-sm focus:outline-none"
          onInteractOutside={() => setDeletingId(null)}
        >
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t("hermes.chat.deleteConfirm", {
                defaultValue: "删除聊天记录？此操作无法撤销。",
              })}
            </DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeletingId(null)}
            >
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deletingId) onDeleteSession(deletingId);
                setDeletingId(null);
              }}
            >
              {t("common.delete", { defaultValue: "删除" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
