import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Wrench } from "lucide-react";
import type { ChatToolCall } from "@/types";
import { cn } from "@/lib/utils";

interface ToolCallBlockProps {
  toolCall: ChatToolCall;
  result?: string | null;
}

export function ToolCallBlock({ toolCall, result }: ToolCallBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  let formattedArgs = toolCall.function.arguments;
  try {
    formattedArgs = JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2);
  } catch {
    // keep raw string
  }

  return (
    <div className="border rounded-md my-1 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 hover:bg-muted/50 rounded-t-md text-left"
      >
        <ChevronRight
          className={cn("w-3 h-3 transition-transform", expanded && "rotate-90")}
        />
        <Wrench className="w-3 h-3 text-muted-foreground" />
        <span className="font-medium">{toolCall.function.name}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-1">
          <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap text-[11px]">
            {formattedArgs}
          </pre>
          {result && (
            <>
              <div className="text-muted-foreground font-medium">{t("hermes.chat.toolResult")}</div>
              <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap text-[11px]">
                {result}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
