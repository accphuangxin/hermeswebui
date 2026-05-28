import { useCallback, useRef, useState, KeyboardEvent, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Send, Square, Paperclip, X, Sparkles } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { chatApi } from "@/lib/api/chat";
import { cn } from "@/lib/utils";
import type { ChatFileRef } from "@/types";
import type { InstalledSkill } from "@/lib/api/skills";

const HERMES_COMMANDS = [
  { cmd: "/clear", desc: "Clear conversation and start fresh" },
];

interface ChatInputProps {
  onSend: (text: string, files: ChatFileRef[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  favoriteSkills?: InstalledSkill[];
}

export function ChatInput({ onSend, onStop, isStreaming, disabled, favoriteSkills = [] }: ChatInputProps) {
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

  const filteredCommands = HERMES_COMMANDS.filter((c) =>
    c.cmd.startsWith(commandFilter || "/"),
  );

  const filteredSkills = favoriteSkills.filter((s) =>
    s.name.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    s.directory.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [commandFilter]);

  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionFilter]);

  // scroll the highlighted mention item into view
  useEffect(() => {
    if (!showMentions || !mentionMenuRef.current) return;
    const el = mentionMenuRef.current.querySelectorAll<HTMLButtonElement>("button")[mentionSelectedIndex];
    el?.scrollIntoView({ block: "nearest" });
  }, [mentionSelectedIndex, showMentions]);

  const handleSend = useCallback(() => {
    const value = textareaRef.current?.value.trim();
    if (!value && files.length === 0) return;

    setShowCommands(false);
    setShowMentions(false);

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
    // replace from @ trigger position to current cursor
    const before = value.slice(0, mentionTriggerPos);
    const after = value.slice(el.selectionStart);
    const inserted = `使用技能: ${skill.name}, `;
    el.value = before + inserted + after;
    // move cursor after the inserted mention
    const newPos = mentionTriggerPos + inserted.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
    // resize
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";

    setShowMentions(false);
    setMentionFilter("");
    setMentionTriggerPos(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // @mention popup takes priority
    if (showMentions && filteredSkills.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((i) => (i + 1) % filteredSkills.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex((i) => (i - 1 + filteredSkills.length) % filteredSkills.length);
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
        setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
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
      e.preventDefault();
      if (!isStreaming && !disabled) {
        handleSend();
      }
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";

    const value = el.value;
    const cursor = el.selectionStart;

    // detect @mention: scan backwards from cursor for '@'
    const textBeforeCursor = value.slice(0, cursor);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1 && favoriteSkills.length > 0) {
      const fragment = textBeforeCursor.slice(atIndex + 1);
      // only show if no space in the fragment (still typing the mention)
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
        const { filename, content, sizeBytes } = await chatApi.readFile(path);
        setFiles((prev) => [...prev, { filename, content, sizeBytes, mimeType: "" }]);
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
          { filename, content: base64, sizeBytes: blob.size, mimeType: blob.type },
        ]);
        resolve();
      };
      reader.readAsDataURL(blob);
    });
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
        await addFileFromBlob(blob, filename);
      } else {
        const file = blob as File;
        const filename = file.name || `paste_${Date.now()}`;
        await addFileFromBlob(blob, filename);
      }
    }
  }, []);

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
      {/* @mention popup */}
      {showMentions && filteredSkills.length > 0 && (
        <div
          ref={mentionMenuRef}
          className="absolute bottom-full left-3 right-3 mb-1 bg-popover border rounded-md shadow-md max-h-[240px] overflow-y-auto z-50"
        >
          {filteredSkills.map((s, i) => (
            <button
              key={s.id}
              onClick={() => insertMention(s)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                i === mentionSelectedIndex && "bg-muted",
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="font-medium flex-shrink-0">{s.name}</span>
              {s.description && (
                <span className="text-muted-foreground text-xs min-w-0 truncate">{s.description}</span>
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
              onClick={() => insertCommand(c.cmd)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                i === selectedIndex && "bg-muted",
              )}
            >
              <span className="font-mono font-medium text-primary w-24 flex-shrink-0">
                {c.cmd}
              </span>
              <span className="text-muted-foreground text-xs truncate">{c.desc}</span>
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
              <span className="text-muted-foreground">({formatSize(f.sizeBytes)})</span>
              <button onClick={() => removeFile(i)} className="hover:text-destructive ml-0.5">
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
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={t("hermes.chat.placeholder")}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 min-h-[36px] max-h-[160px]"
        />
        {isStreaming ? (
          <Button size="icon" variant="destructive" onClick={onStop} className="h-9 w-9">
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
