import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, User, Bot } from "lucide-react";
import type { ChatMessage as ChatMessageType, ChatToolCall } from "@/types";
import { ToolCallBlock } from "./ToolCallBlock";
import { cn } from "@/lib/utils";

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
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm max-w-[85%] inline-block",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted",
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <Markdown
                remarkPlugins={[remarkGfm]}
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
                }}
              >
                {message.content}
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
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1"
            title={copied ? t("hermes.chat.copied") : t("hermes.chat.copy")}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
});
