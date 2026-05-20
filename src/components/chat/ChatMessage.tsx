import { memo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Check, User, Bot, Paperclip } from "lucide-react";
import type { ChatMessage as ChatMessageType, ChatToolCall, ChatFileRef } from "@/types";
import { ToolCallBlock } from "./ToolCallBlock";
import { cn } from "@/lib/utils";

// Convert bare MEDIA:/path references in text into Markdown image syntax
function preprocessMediaLinks(content: string): string {
  return content.replace(
    /(?<!\()(MEDIA:[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp))/gi,
    (_, p) => `![](${p})`,
  );
}

function isLocalPath(src: string): boolean {
  return src.startsWith("MEDIA:") || src.startsWith("file://") || src.startsWith("/");
}

function extractLocalPath(src: string): string {
  if (src.startsWith("MEDIA:")) return src.slice("MEDIA:".length);
  if (src.startsWith("file://")) return decodeURIComponent(src.slice("file://".length));
  return src;
}

// Async component that loads a local file via Tauri and renders as base64
function LocalImage({ src, alt }: { src: string; alt: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const path = extractLocalPath(src);
    invoke<string>("read_local_image", { path })
      .then(setDataUrl)
      .catch((e) => { setError(true); setErrorMsg(String(e)); console.error("[LocalImage] failed:", path, e); });
  }, [src]);

  if (error) return <span className="text-xs text-muted-foreground italic">[图片加载失败: {errorMsg ?? extractLocalPath(src)}]</span>;
  if (!dataUrl) return <span className="text-xs text-muted-foreground animate-pulse">加载图片中...</span>;
  return (
    <img
      src={dataUrl}
      alt={alt}
      className="max-w-full rounded-lg my-1 cursor-pointer"
      onClick={() => window.open(dataUrl, "_blank")}
    />
  );
}

interface ChatMessageProps {
  message: ChatMessageType;
  toolResults?: Map<string, string>;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  toolResults,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";

  const toolCalls: ChatToolCall[] = message.toolCalls
    ? (() => {
        try {
          return JSON.parse(message.toolCalls);
        } catch {
          return [];
        }
      })()
    : [];

  const fileRefs: ChatFileRef[] = message.fileRefs
    ? (() => {
        try {
          return JSON.parse(message.fileRefs);
        } catch {
          return [];
        }
      })()
    : [];

  // Strip legacy inline <file name="...">...</file> blocks from content for display,
  // extracting filenames to show as chips (for messages saved before fileRefs was used).
  const FILE_BLOCK_RE = /<file name="([^"]+)">([\s\S]*?)<\/file>/g;
  const legacyFileChips: { filename: string }[] = [];
  let displayContent = message.content;
  if (isUser && fileRefs.length === 0 && FILE_BLOCK_RE.test(message.content)) {
    displayContent = message.content
      .replace(/<file name="([^"]+)">[\s\S]*?<\/file>/g, (_, name: string) => {
        legacyFileChips.push({ filename: name });
        return "";
      })
      .replace(/^\n+|\n+$/g, "")
      .trim();
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isTool) return null;

  return (
    <div className={cn("group flex gap-2 px-3 py-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-primary/10" : "bg-muted",
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={cn("flex-1 min-w-0 space-y-1", isUser && "flex flex-col items-end")}>
        {isUser && (fileRefs.length > 0 || legacyFileChips.length > 0) && (
          <div className="flex flex-wrap gap-1 max-w-[85%] justify-end">
            {fileRefs.map((f, i) => (
              <div
                key={`ref-${f.filename}-${i}`}
                className="flex items-center gap-1 bg-primary/20 text-primary rounded px-2 py-0.5 text-xs"
              >
                <Paperclip className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[120px]">{f.filename}</span>
                <span className="opacity-60">({formatSize(f.sizeBytes)})</span>
              </div>
            ))}
            {legacyFileChips.map((f, i) => (
              <div
                key={`legacy-${f.filename}-${i}`}
                className="flex items-center gap-1 bg-primary/20 text-primary rounded px-2 py-0.5 text-xs"
              >
                <Paperclip className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[120px]">{f.filename}</span>
              </div>
            ))}
          </div>
        )}
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm max-w-[85%] inline-block",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted",
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{displayContent || <span className="opacity-50">{t("hermes.chat.fileOnly", { defaultValue: "(附件)" })}</span>}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <Markdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(url) => {
                  if (url.startsWith("MEDIA:") || url.startsWith("/") || url.startsWith("file://")) {
                    return url;
                  }
                  return defaultUrlTransform(url);
                }}
                components={{
                  pre: ({ children }) => (
                    <pre className="bg-background/50 rounded p-2 my-1 overflow-x-auto text-xs">
                      {children}
                    </pre>
                  ),
                  code: ({ children, className }) =>
                    className ? (
                      <code className="text-xs">{children}</code>
                    ) : (
                      <code className="bg-background/50 rounded px-1 py-0.5 text-xs">{children}</code>
                    ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      {children}
                    </a>
                  ),
                  img: ({ src, alt }) => {
                    if (!src) return null;
                    if (isLocalPath(src)) {
                      return <LocalImage src={src} alt={alt ?? ""} />;
                    }
                    return (
                      <img
                        src={src}
                        alt={alt ?? ""}
                        className="max-w-full rounded-lg my-1"
                      />
                    );
                  },
                }}
              >
                {preprocessMediaLinks(message.content)}
              </Markdown>
            </div>
          )}
        </div>
        {isAssistant && toolCalls.length > 0 && (
          <div className="max-w-[85%]">
            {toolCalls.map((tc) => (
              <ToolCallBlock
                key={tc.id}
                toolCall={tc}
                result={toolResults?.get(tc.id) ?? null}
              />
            ))}
          </div>
        )}
        {(isAssistant || isUser) && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {message.createdAt > 0 && (
              <span className="text-[10px] text-muted-foreground select-none">
                {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground p-1"
              title={copied ? t("hermes.chat.copied") : t("hermes.chat.copy")}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
