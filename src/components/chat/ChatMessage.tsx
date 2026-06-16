import React, { memo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  Copy,
  Check,
  User,
  Bot,
  Paperclip,
  Trash2,
  RotateCcw,
  FolderOpen,
} from "lucide-react";
import type {
  ChatMessage as ChatMessageType,
  ChatToolCall,
  ChatFileRef,
} from "@/types";
import { ToolCallBlock } from "./ToolCallBlock";
import { cn } from "@/lib/utils";

// ─── Table repair ────────────────────────────────────────────────────────────
// Find paragraphs (separated by blank lines) that contain "||" and repair them.
// Strategy: split the paragraph into tokens by "||", then reassemble rows by
// counting pipe characters per token to detect row boundaries.
function repairCompressedTable(content: string): string {
  const paragraphs = content.split(/\n{2,}/);
  const processed = paragraphs.map((para) => {
    if (!para.includes("||")) return para;

    // Join all lines of the paragraph into one string, replacing newlines with spaces.
    // Before joining, strip leading/trailing pipes per line to avoid creating false "||".
    const paraLines = para.split("\n").map((l) => l.trim()).filter(Boolean);

    // Detect the column count from the first line that contains "||" (it has the header)
    const firstDoublePipeLine = paraLines.find((l) => l.includes("||"));
    if (!firstDoublePipeLine) return para;

    // Count columns in header: split the portion before first "||" by "|"
    const headerPart = firstDoublePipeLine.split("||")[0];
    const colCount = headerPart.split("|").map((c) => c.trim()).filter(Boolean).length;
    if (colCount < 2) return para;

    // Flatten the whole paragraph into one pipe stream, removing line breaks
    // Use a sentinel that won't appear in content to track original line boundaries
    const flat = paraLines
      .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").trim())
      .join(" | ")
      .replace(/\s+/g, " ")
      .trim();

    // Now split by "||" to get row fragments, then split each by "|" for cells
    // But first, we need to reconstruct from the flat stream using colCount
    const allCells = flat.split(/\s*\|\|\s*|\s*\|\s*/)
      .map((c) => c.trim())
      .filter(Boolean);

    if (allCells.length < colCount * 2) return para;

    const rows: string[][] = [];
    for (let i = 0; i < allCells.length; i += colCount) {
      const row = allCells.slice(i, i + colCount);
      if (row.length === colCount) rows.push(row);
    }
    if (rows.length < 2) return para;

    const header = `| ${rows[0].join(" | ")} |`;
    const sep    = `| ${Array(colCount).fill("---").join(" | ")} |`;
    const data   = rows.slice(1).map((r) => `| ${r.join(" | ")} |`);
    return [header, sep, ...data].join("\n");
  });
  return processed.join("\n\n");
}

// ─── Media / path preprocessing ──────────────────────────────────────────────

function preprocessMediaLinks(content: string): string {
  let result = repairCompressedTable(content);
  result = result.replace(
    /(?<!\()(MEDIA:[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp))/gi,
    (_, p) => `![](${p})`,
  );
  result = result.replace(/(?<!\()(MEDIA:[^\s"'<>]+\.html?)/gi, (_, p) => {
    const name = p.split("/").pop() ?? "HTML";
    return `[${name}](${p})`;
  });
  // Convert bare absolute file paths to clickable links
  result = result.replace(
    /(?<!\()(?<!\[)(\/(?:[^\s，。、；：！？\[\]()（）]+)\/[^\s，。、；：！？\[\]()（）]+\.\w+)/g,
    (_, p) => {
      const name = p.split("/").pop() ?? p;
      return `[${name}](${p})`;
    },
  );
  return result;
}

function isLocalPath(src: string): boolean {
  return (
    src.startsWith("MEDIA:") || src.startsWith("file://") || src.startsWith("/")
  );
}

function extractLocalPath(src: string): string {
  if (src.startsWith("MEDIA:")) return src.slice("MEDIA:".length);
  if (src.startsWith("file://"))
    return decodeURIComponent(src.slice("file://".length));
  return src;
}

function FilePathButton({ path: rawPath, label }: { path: string; label: string }) {
  const path = rawPath.includes("%") ? decodeURIComponent(rawPath) : rawPath;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setPos(null);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="text-primary underline underline-offset-2 hover:opacity-80 font-mono text-xs cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          if (open) { setPos(null); return; }
          setPos({ x: e.clientX, y: e.clientY + 6 });
        }}
      >
        {label}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] flex rounded-md border bg-popover shadow-lg"
          style={{ left: pos.x, top: pos.y, whiteSpace: "nowrap" }}
        >
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs hover:bg-muted transition-colors"
            onClick={() => {
              invoke("open_file_path", { path })
                .then(() => setPos(null))
                .catch((e) => { toast.error(`浏览失败: ${String(e)}`); setPos(null); });
            }}
          >
            <FolderOpen className="w-3 h-3" />
            浏览
          </button>
          <span className="w-px bg-border" />
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs hover:bg-muted transition-colors"
            onClick={async () => {
              await navigator.clipboard.writeText(path);
              setCopied(true);
              setTimeout(() => { setCopied(false); setPos(null); }, 1500);
            }}
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            复制路径
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl cursor-default object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

function LocalImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    const path = extractLocalPath(src);
    invoke<string>("read_local_image", { path })
      .then(setDataUrl)
      .catch((e) => {
        setError(true);
        setErrorMsg(String(e));
        console.error("[LocalImage] failed:", path, e);
      });
  }, [src]);

  if (error)
    return (
      <span className="text-xs text-muted-foreground italic">
        [图片加载失败: {errorMsg ?? extractLocalPath(src)}]
      </span>
    );
  if (!dataUrl)
    return (
      <span className="text-xs text-muted-foreground animate-pulse">
        加载图片中...
      </span>
    );
  return (
    <>
      <img
        src={dataUrl}
        alt={alt}
        className={className ?? "max-w-full rounded-lg my-1 cursor-zoom-in"}
        onClick={() => setLightbox(true)}
      />
      {lightbox && <ImageLightbox src={dataUrl} alt={alt} onClose={() => setLightbox(false)} />}
    </>
  );
}

function LocalHtml({ path }: { path: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    invoke<string>("read_local_html", { path })
      .then(setHtml)
      .catch((e) => setError(String(e)));
  }, [path]);

  const filename = path.split("/").pop() ?? "HTML";

  if (error)
    return (
      <span className="text-xs text-muted-foreground italic">
        [HTML 加载失败: {error}]
      </span>
    );

  return (
    <div className="my-2 rounded-lg border overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-muted/50 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {filename}
        </span>
        <span className="text-xs text-muted-foreground">
          {expanded ? "▲ 收起" : "▼ 展开"}
        </span>
      </div>
      {expanded &&
        (html === null ? (
          <div className="p-3 text-xs text-muted-foreground animate-pulse">
            加载中...
          </div>
        ) : (
          <iframe
            srcDoc={html}
            sandbox="allow-scripts allow-same-origin"
            className="w-full border-0"
            style={{ height: "400px" }}
            title={filename}
          />
        ))}
    </div>
  );
}

function MarkdownPre({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const handleCopy = () => {
    const text = preRef.current?.innerText ?? "";
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="relative group my-1.5">
      <pre
        ref={preRef}
        className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded p-3 overflow-x-auto text-xs border border-zinc-200 dark:border-zinc-700"
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300"
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-400" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}

function MarkdownCode({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!className) {
    const text = String(children);
    const mdLink = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(text);
    if (mdLink) {
      const [, label, href] = mdLink;
      const localPath = extractLocalPath(href);
      if (href.startsWith("/") || href.startsWith("file://")) {
        return <FilePathButton path={localPath} label={label} />;
      }
    }
    if (/^\/(?:[^\s]+\/)+[^\s]+\.\w+$/.test(text)) {
      return <FilePathButton path={text} label={text} />;
    }
  }
  return className ? (
    <code className="text-xs">{children}</code>
  ) : (
    <code className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded px-1 py-0.5 text-xs">
      {children}
    </code>
  );
}

function MarkdownA({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (href && /MEDIA:[^\s"'<>]+\.html?$/i.test(href)) {
    return <LocalHtml path={extractLocalPath(href)} />;
  }
  if (href && (href.startsWith("/") || href.startsWith("file://"))) {
    const localPath = extractLocalPath(href);
    return <FilePathButton path={localPath} label={String(children)} />;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
      {children}
    </a>
  );
}

function MarkdownImg({ src, alt }: { src?: string; alt?: string }) {
  if (!src) return null;
  if (isLocalPath(src)) {
    return <LocalImage src={src} alt={alt ?? ""} />;
  }
  return <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg my-1" />;
}

function MarkdownTable({ children }: { children?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto my-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  );
}
function MarkdownTh({ children }: { children?: React.ReactNode }) {
  return <th className="border border-border bg-muted px-2 py-1 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function MarkdownTd({ children }: { children?: React.ReactNode }) {
  return <td className="border border-border px-2 py-1 whitespace-nowrap">{children}</td>;
}

const markdownComponents = {
  pre: MarkdownPre,
  code: MarkdownCode,
  a: MarkdownA,
  img: MarkdownImg,
  table: MarkdownTable,
  th: MarkdownTh,
  td: MarkdownTd,
};

interface ContextMenuState {
  x: number;
  y: number;
}

interface ChatMessageProps {
  message: ChatMessageType;
  toolResults?: Map<string, string>;
  onDelete?: (messageId: string) => void;
  onResend?: (content: string) => void;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  toolResults,
  onDelete,
  onResend,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

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

  const handleCopy = useCallback(async () => {
    const text = isUser ? displayContent : message.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [isUser, displayContent, message.content]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!isUser && !isAssistant) return;
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [isUser, isAssistant],
  );

  const closeMenu = useCallback(() => setContextMenu(null), []);

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || !sel || sel.rangeCount === 0) {
        setSelectionMenu(null);
        return;
      }
      if (bubbleRef.current && !bubbleRef.current.contains(sel.anchorNode)) {
        setSelectionMenu(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionMenu({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        text,
      });
    }, 10);
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel?.toString().trim()) setSelectionMenu(null);
    };
    const handleRightMouseDown = (e: MouseEvent) => {
      if (e.button === 2) setSelectionMenu(null);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mousedown", handleRightMouseDown);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mousedown", handleRightMouseDown);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenu, closeMenu]);

  if (isTool) return null;

  return (
    <div
      className={cn("group flex gap-2 px-3 py-2", isUser && "flex-row-reverse")}
      data-message-bubble
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-primary/10" : "bg-muted",
        )}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5" />
        ) : (
          <Bot className="w-3.5 h-3.5" />
        )}
      </div>
      <div
        className={cn(
          "flex-1 min-w-0 space-y-1",
          isUser && "flex flex-col items-end",
        )}
      >
        {isUser && (fileRefs.length > 0 || legacyFileChips.length > 0) && (
          <div className="flex flex-wrap gap-1 max-w-[85%] justify-end">
            {fileRefs.map((f, i) => {
              const isImage = f.mimeType?.startsWith("image/");
              if (isImage && f.sourcePath) {
                return (
                  <LocalImage
                    key={`ref-${f.filename}-${i}`}
                    src={f.sourcePath}
                    alt={f.filename}
                    className="max-h-40 max-w-xs rounded-lg cursor-pointer object-contain"
                  />
                );
              }
              return (
                <div
                  key={`ref-${f.filename}-${i}`}
                  className="flex items-center gap-1 bg-primary/20 text-primary rounded px-2 py-0.5 text-xs"
                >
                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[120px]">{f.filename}</span>
                  <span className="opacity-60">({formatSize(f.sizeBytes)})</span>
                </div>
              );
            })}
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
          ref={bubbleRef}
          className={cn(
            "rounded-lg px-3 py-2 text-sm max-w-[85%] inline-block cursor-default",
            isUser
              ? "bg-primary text-primary-foreground user-bubble"
              : "bg-muted",
          )}
          onContextMenu={handleContextMenu}
          onMouseUp={handleMouseUp}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">
              {displayContent || (
                <span className="opacity-50">
                  {t("hermes.chat.fileOnly", { defaultValue: "(附件)" })}
                </span>
              )}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <Markdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(url) => {
                  if (
                    url.startsWith("MEDIA:") ||
                    url.startsWith("/") ||
                    url.startsWith("file://")
                  ) {
                    return url;
                  }
                  return defaultUrlTransform(url);
                }}
                components={markdownComponents}
              >
                {preprocessMediaLinks(message.content)}
              </Markdown>
            </div>
          )}
        </div>
        {(isAssistant || isUser) && message.createdAt > 0 && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-muted-foreground select-none px-1">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
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
      </div>

      {/* Selection copy menu */}
      {selectionMenu && (
        <div
          ref={selectionMenuRef}
          className="fixed z-50 rounded-md border bg-popover shadow-lg py-1 flex items-center"
          style={{
            left: selectionMenu.x,
            top: selectionMenu.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <button
            className="flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-muted transition-colors whitespace-nowrap"
            onMouseDown={(e) => e.preventDefault()}
            onClick={async () => {
              await navigator.clipboard.writeText(selectionMenu.text);
              setSelectionMenu(null);
              window.getSelection()?.removeAllRanges();
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="w-3 h-3" />
            复制
          </button>
        </div>
      )}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] rounded-md border bg-popover shadow-md py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left"
            onClick={() => {
              void handleCopy();
              closeMenu();
            }}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {t("hermes.chat.copy", { defaultValue: "复制" })}
          </button>
          {isUser && onResend && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left"
              onClick={() => {
                onResend(displayContent);
                closeMenu();
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t("hermes.chat.resend", { defaultValue: "重发" })}
            </button>
          )}
          {onDelete && (
            <>
              <div className="my-1 border-t" />
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left text-destructive"
                onClick={() => {
                  onDelete(message.id);
                  closeMenu();
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t("hermes.chat.deleteMessage", { defaultValue: "删除" })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
