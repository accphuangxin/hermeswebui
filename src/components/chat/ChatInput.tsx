import { useCallback, useRef, useState, KeyboardEvent, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Send, Square, Paperclip, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { chatApi } from "@/lib/api/chat";
import { cn } from "@/lib/utils";
import type { ChatFileRef } from "@/types";

const HERMES_COMMANDS = [
  { cmd: "/clear", desc: "Clear conversation and start fresh" },
];

interface ChatInputProps {
  onSend: (text: string, files: ChatFileRef[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<ChatFileRef[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredCommands = HERMES_COMMANDS.filter((c) =>
    c.cmd.startsWith(commandFilter || "/"),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [commandFilter]);

  const handleSend = useCallback(() => {
    const value = textareaRef.current?.value.trim();
    if (!value && files.length === 0) return;

    setShowCommands(false);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        // Strip the data URL prefix to get raw base64 content
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
        // Non-image file — read via Tauri if it has a path, else as blob
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
      {/* Command autocomplete menu */}
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
