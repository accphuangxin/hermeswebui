import { useState } from "react";
import { Loader2, Check, X, ChevronDown, ChevronRight, Terminal, FileText, Globe, Wrench } from "lucide-react";
import type { ToolActivity } from "@/hooks/useChatStream";
import { cn } from "@/lib/utils";

interface ToolActivityBlockProps {
  activity: ToolActivity;
  isLast?: boolean;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  terminal: <Terminal className="w-3 h-3" />,
  bash: <Terminal className="w-3 h-3" />,
  read_file: <FileText className="w-3 h-3" />,
  write_file: <FileText className="w-3 h-3" />,
  web_search: <Globe className="w-3 h-3" />,
  browser: <Globe className="w-3 h-3" />,
};

function getToolIcon(tool: string) {
  const lower = tool.toLowerCase();
  for (const [key, icon] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return <Wrench className="w-3 h-3" />;
}

export function ToolActivityBlock({ activity, isLast }: ToolActivityBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = !!activity.result;
  const isRunning = activity.status === "running";

  return (
    <div className="flex gap-2">
      {/* Vertical axis */}
      <div className="flex flex-col items-center pt-1 shrink-0" style={{ width: 20 }}>
        {/* Dot */}
        <div className={cn(
          "w-4 h-4 rounded-full flex items-center justify-center shrink-0 border",
          isRunning
            ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
            : activity.status === "error"
              ? "border-red-400 bg-red-50 dark:bg-red-900/20"
              : "border-green-400 bg-green-50 dark:bg-green-900/20",
        )}>
          {isRunning ? (
            <Loader2 className="w-2.5 h-2.5 text-yellow-500 animate-spin" />
          ) : activity.status === "error" ? (
            <X className="w-2.5 h-2.5 text-red-500" />
          ) : (
            <Check className="w-2.5 h-2.5 text-green-500" />
          )}
        </div>
        {/* Connecting line */}
        {!isLast && (
          <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 8 }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-3">
        {/* Header row */}
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 text-xs w-full text-left",
            hasResult && "hover:opacity-80 cursor-pointer",
            !hasResult && "cursor-default",
          )}
          onClick={() => hasResult && setExpanded((v) => !v)}
          disabled={!hasResult}
        >
          <span className="text-muted-foreground">{getToolIcon(activity.tool)}</span>
          <span className="font-medium text-foreground">{activity.tool}</span>
          {activity.preview && (
            <span className="text-muted-foreground/70 truncate max-w-[280px] font-mono">
              {activity.preview}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 shrink-0 text-muted-foreground/60">
            {activity.duration !== undefined && (
              <span>{activity.duration.toFixed(1)}s</span>
            )}
            {hasResult && (
              expanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
            )}
          </span>
        </button>

        {/* Expanded result */}
        {expanded && activity.result && (
          <div className="mt-1.5 rounded border bg-muted/40 px-2 py-1.5 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
            {activity.result}
          </div>
        )}
      </div>
    </div>
  );
}
