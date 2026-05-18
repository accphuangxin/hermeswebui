import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, MessageSquare, Pencil } from "lucide-react";
import type { ChatSession } from "@/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type SidebarTab = "chat" | "cron";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}: ChatSidebarProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
        >
          <Plus className="w-4 h-4" />
          {t("hermes.chat.newSession")}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          {sessions.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              {t("hermes.chat.noSessions")}
            </div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              onDoubleClick={() => startRename(s)}
              className={cn(
                "group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors",
                activeSessionId === s.id && "bg-muted font-medium",
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
              {editingId !== s.id && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(s);
                    }}
                    className="p-0.5 hover:text-foreground"
                    title={t("hermes.chat.rename")}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    className="p-0.5 hover:text-destructive"
                    title={t("hermes.chat.deleteSession")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
