import { useCallback, useRef, useState, KeyboardEvent, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Send, Square, Paperclip, X, Sparkles, Bot, Eye, EyeOff } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { chatApi } from "@/lib/api/chat";
import { cn } from "@/lib/utils";
import type { ChatFileRef } from "@/types";
import type { InstalledSkill } from "@/lib/api/skills";
import type { HermesAgent } from "@/lib/api/agents";

const HERMES_COMMANDS = [
  { cmd: "/clear", desc: "Clear conversation and start fresh" },
  { cmd: "/export", desc: "Export current session as Markdown" },
  { cmd: "/preview", desc: "Toggle Markdown preview panel" },
];

interface ChatInputProps {
  onSend: (text: string, files: ChatFileRef[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  favoriteSkills?: InstalledSkill[];
  agents?: HermesAgent[];
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string, port?: number, key?: string) => void;
  onTogglePreview?: () => void;
  isPreviewOpen?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  favoriteSkills = [],
  agents = [],
  selectedAgentId,
  onSelectAgent,
  onTogglePreview,
  isPreviewOpen,
}: ChatInputProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<ChatFileRef[]>([]);

  // slash command state
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // @mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionTriggerPos, setMentionTriggerPos] = useState(-1);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  // ~agent state
  const [showAgents, setShowAgents] = useState(false);
  const [agentFilter, setAgentFilter] = useState("");
  const [agentSelectedIndex, setAgentSelectedIndex] = useState(0);
  const [agentTriggerPos, setAgentTriggerPos] = useState(-1);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const compositionEndTimeRef = useRef(0);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filteredCommands = HERMES_COMMANDS.filter((c) =>
    c.cmd.startsWith(commandFilter || "/"),
  );

  const filteredSkills = favoriteSkills.filter(
    (s) =>
      s.name.toLowerCase().includes(mentionFilter.toLowerCase()) ||
      s.directory.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  const filteredAgents = agents.filter((a) => {
    if (a.status === "stopped") return false;
    const name = a.name.toLowerCase();
    const desc = (a.description ?? "").toLowerCase();
    const q = agentFilter.toLowerCase();
    return name.includes(q) || desc.includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [commandFilter]);

  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionFilter]);

  useEffect(() => {
    setAgentSelectedIndex(0);
  }, [agentFilter]);

  // scroll the highlighted mention item into view
  useEffect(() => {
    if (!showMentions || !mentionMenuRef.current) return;
    const el =
      mentionMenuRef.current.querySelectorAll<HTMLButtonElement>("button")[
        mentionSelectedIndex
      ];
    el?.scrollIntoView({ block: "nearest" });
  }, [mentionSelectedIndex, showMentions]);

  // scroll the highlighted agent item into view
  useEffect(() => () => stopAccelDelete(), []); // cleanup on unmount

  useEffect(() => {
    if (!showAgents || !agentMenuRef.current) return;
    const el =
      agentMenuRef.current.querySelectorAll<HTMLButtonElement>("button")[
        agentSelectedIndex
      ];
    el?.scrollIntoView({ block: "nearest" });
  }, [agentSelectedIndex, showAgents]);

  const handleSend = useCallback(() => {
    const value = textareaRef.current?.value.trim();
    if (!value && files.length === 0) return;

    setShowCommands(false);
    setShowMentions(false);
    setShowAgents(false);

    onSend(value || "", files);
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
  }, [onSend, files]);

  const insertCommand = (cmd: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = cmd + " ";
      textareaRef.current.focus();
    }
    setShowCommands(false);
    setCommandFilter("");
  };

  const insertMention = (skill: InstalledSkill) => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value;
    const before = value.slice(0, mentionTriggerPos);
    const after = value.slice(el.selectionStart);
    const inserted = `使用技能: ${skill.name}, `;
    el.value = before + inserted + after;
    const newPos = mentionTriggerPos + inserted.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";

    setShowMentions(false);
    setMentionFilter("");
    setMentionTriggerPos(-1);
  };

  const selectAgent = (agent: HermesAgent) => {
    const el = textareaRef.current;
    if (!el) return;
    // remove the ~fragment from the input
    const before = el.value.slice(0, agentTriggerPos);
    const after = el.value.slice(el.selectionStart);
    el.value = before + after;
    el.setSelectionRange(before.length, before.length);
    el.focus();
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";

    setShowAgents(false);
    setAgentFilter("");
    setAgentTriggerPos(-1);

    if (onSelectAgent) {
      const agentId =
        agent.isDefault || agent.name === "default" ? "default" : agent.name;
      onSelectAgent(agentId, agent.apiServerPort, agent.apiServerKey);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // ~agent popup takes highest priority
    if (showAgents && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAgentSelectedIndex((i) => (i + 1) % filteredAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAgentSelectedIndex(
          (i) => (i - 1 + filteredAgents.length) % filteredAgents.length,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectAgent(filteredAgents[agentSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAgents(false);
        return;
      }
    }

    // @mention popup takes priority
    if (showMentions && filteredSkills.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((i) => (i + 1) % filteredSkills.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex(
          (i) => (i - 1 + filteredSkills.length) % filteredSkills.length,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertMention(filteredSkills[mentionSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertCommand(filteredCommands[selectedIndex].cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      // Block if IME is composing, or if compositionend fired within the last 30ms
      // (macOS WebKit fires compositionend before keydown for the confirming Enter)
      const justFinishedComposing = Date.now() - compositionEndTimeRef.current < 30;
      if (isComposingRef.current || justFinishedComposing) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!isStreaming && !disabled) {
        handleSend();
      }
    }
  };

  const stopAccelDelete = () => {
    if (deleteTimerRef.current) { clearTimeout(deleteTimerRef.current); deleteTimerRef.current = null; }
    if (deleteIntervalRef.current) { clearInterval(deleteIntervalRef.current); deleteIntervalRef.current = null; }
  };

  const handleKeyDownAccel = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    if (isComposingRef.current) return;
    if (e.repeat) return; // native repeat already started; our timer handles it

    const el = textareaRef.current;
    if (!el) return;

    const doDelete = () => {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (start === end && start === 0 && e.key === "Backspace") return;
      if (start === end && end === el.value.length && e.key === "Delete") return;

      // Delete one char at cursor (or selection)
      const val = el.value;
      let newVal: string;
      let newPos: number;
      if (start !== end) {
        newVal = val.slice(0, start) + val.slice(end);
        newPos = start;
      } else if (e.key === "Backspace") {
        newVal = val.slice(0, start - 1) + val.slice(start);
        newPos = start - 1;
      } else {
        newVal = val.slice(0, start) + val.slice(start + 1);
        newPos = start;
      }
      // Use native input setter so React detects the change
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(el, newVal);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.setSelectionRange(newPos, newPos);
    };

    // After 400ms hold, start accelerated delete at 40ms intervals
    deleteTimerRef.current = setTimeout(() => {
      deleteIntervalRef.current = setInterval(doDelete, 40);
    }, 400);
  };

  const handleKeyUpAccel = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") stopAccelDelete();
  };


  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";

    const value = el.value;
    const cursor = el.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);

    // detect ~agent: scan backwards from cursor for '~'
    const tildeIndex = textBeforeCursor.lastIndexOf("~");
    if (tildeIndex !== -1 && agents.length > 0) {
      const fragment = textBeforeCursor.slice(tildeIndex + 1);
      if (!fragment.includes(" ") && !fragment.includes("\n")) {
        setAgentTriggerPos(tildeIndex);
        setAgentFilter(fragment);
        setShowAgents(true);
        setShowMentions(false);
        setShowCommands(false);
        return;
      }
    }
    setShowAgents(false);

    // detect @mention: scan backwards from cursor for '@'
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1 && favoriteSkills.length > 0) {
      const fragment = textBeforeCursor.slice(atIndex + 1);
      if (!fragment.includes(" ") && !fragment.includes("\n")) {
        setMentionTriggerPos(atIndex);
        setMentionFilter(fragment);
        setShowMentions(true);
        setShowCommands(false);
        return;
      }
    }
    setShowMentions(false);

    // slash command detection
    if (value.startsWith("/")) {
      const firstSpace = value.indexOf(" ");
      const partial = firstSpace === -1 ? value : value.slice(0, firstSpace);
      if (firstSpace === -1) {
        setCommandFilter(partial);
        setShowCommands(true);
      } else {
        setShowCommands(false);
      }
    } else {
      setShowCommands(false);
    }
  };

  const handleAttach = async () => {
    const selected = await open({
      multiple: true,
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      try {
        const { filename, content, sizeBytes, mimeType } =
          await chatApi.readFile(path);
        setFiles((prev) => [
          ...prev,
          { filename, content, sizeBytes, mimeType, sourcePath: path },
        ]);
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
  };

  const addFileFromBlob = (blob: Blob, filename: string): Promise<void> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] ?? dataUrl;
        setFiles((prev) => [
          ...prev,
          {
            filename,
            content: base64,
            sizeBytes: blob.size,
            mimeType: blob.type,
          },
        ]);
        resolve();
      };
      reader.readAsDataURL(blob);
    });
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);

      const fileItems = items.filter((item) => item.kind === "file");
      if (fileItems.length === 0) return;

      e.preventDefault();
      for (const item of fileItems) {
        const blob = item.getAsFile();
        if (!blob) continue;

        if (item.type.startsWith("image/")) {
          const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
          const filename = `paste_${Date.now()}.${ext}`;
          // Try to save to a temp file so the agent can reference it by path
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const savedPath = await chatApi.saveTempImage(base64, filename);
            const { content, sizeBytes, mimeType } = await chatApi.readFile(savedPath);
            setFiles((prev) => [...prev, { filename, content, sizeBytes, mimeType, sourcePath: savedPath }]);
          } catch {
            // Fallback: no path, send as base64
            await addFileFromBlob(blob, filename);
          }
        } else {
          const file = blob as File;
          const filename = file.name || `paste_${Date.now()}`;
          await addFileFromBlob(blob, filename);
        }
      }
    },
    [],
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="border-t bg-background relative">
      {/* ~agent popup */}
      {showAgents && filteredAgents.length > 0 && (
        <div
          ref={agentMenuRef}
          className="absolute bottom-full left-3 right-3 mb-1 bg-popover border rounded-md shadow-md max-h-[240px] overflow-y-auto z-50"
        >
          {filteredAgents.map((a, i) => {
            const name = a.name;
            const isSelected =
              a.isDefault || a.name === "default"
                ? selectedAgentId === null
                : a.name === selectedAgentId;
            return (
              <button
                key={a.name}
                onMouseEnter={() => setAgentSelectedIndex(i)}
                onClick={() => selectAgent(a)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                  i === agentSelectedIndex && "bg-muted",
                )}
              >
                <Bot className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="font-medium flex-shrink-0">{name}</span>
                {isSelected && (
                  <span className="text-[10px] text-primary font-medium ml-0.5">
                    ●
                  </span>
                )}
                {a.description && (
                  <span className="text-muted-foreground text-xs min-w-0 truncate">
                    {a.description}
                  </span>
                )}
                {a.model && (
                  <span className="text-muted-foreground/50 text-[10px] font-mono ml-auto flex-shrink-0">
                    {a.model}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* @mention popup */}
      {showMentions && filteredSkills.length > 0 && (
        <div
          ref={mentionMenuRef}
          className="absolute bottom-full left-3 right-3 mb-1 bg-popover border rounded-md shadow-md max-h-[240px] overflow-y-auto z-50"
        >
          {filteredSkills.map((s, i) => (
            <button
              key={s.id}
              onMouseEnter={() => setMentionSelectedIndex(i)}
              onClick={() => insertMention(s)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                i === mentionSelectedIndex && "bg-muted",
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="font-medium flex-shrink-0">{s.name}</span>
              {s.description && (
                <span className="text-muted-foreground text-xs min-w-0 truncate">
                  {s.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* slash command popup */}
      {showCommands && filteredCommands.length > 0 && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-3 right-3 mb-1 bg-popover border rounded-md shadow-md max-h-[240px] overflow-y-auto z-50"
        >
          {filteredCommands.map((c, i) => (
            <button
              key={c.cmd}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => insertCommand(c.cmd)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                i === selectedIndex && "bg-muted",
              )}
            >
              <span className="font-mono font-medium text-primary w-24 flex-shrink-0">
                {c.cmd}
              </span>
              <span className="text-muted-foreground text-xs truncate">
                {c.desc}
              </span>
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          {files.map((f, i) => (
            <div
              key={`${f.filename}-${i}`}
              className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-xs"
            >
              {f.mimeType?.startsWith("image/") && f.content && (
                <img
                  src={`data:${f.mimeType};base64,${f.content}`}
                  alt={f.filename}
                  className="h-8 w-8 object-cover rounded flex-shrink-0"
                />
              )}
              <span className="truncate max-w-[120px]">{f.filename}</span>
              <span className="text-muted-foreground">
                ({formatSize(f.sizeBytes)})
              </span>
              <button
                onClick={() => removeFile(i)}
                className="hover:text-destructive ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 p-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleAttach}
          disabled={disabled || isStreaming}
          className="h-9 w-9 flex-shrink-0"
          title={t("hermes.chat.attachFile")}
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        {onTogglePreview && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onTogglePreview}
            disabled={disabled}
            className={cn("h-9 w-9 flex-shrink-0", isPreviewOpen && "text-primary")}
            title="预览 Markdown"
          >
            {isPreviewOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={t("hermes.chat.placeholder")}
          disabled={disabled}
          onKeyDown={(e) => { handleKeyDown(e); handleKeyDownAccel(e); }}
          onKeyUp={handleKeyUpAccel}
          onBlur={stopAccelDelete}
          onInput={handleInput}
          onPaste={handlePaste}
          onCompositionStart={() => { isComposingRef.current = true; stopAccelDelete(); }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            compositionEndTimeRef.current = Date.now();
          }}
          className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 min-h-[36px] max-h-[160px]"
        />
        {isStreaming ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={onStop}
            className="h-9 w-9"
          >
            <Square className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={disabled}
            className="h-9 w-9"
            title={t("hermes.chat.send")}
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
