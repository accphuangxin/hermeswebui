import { Wrench, Loader2, Check, X } from "lucide-react";
import type { ToolActivity } from "@/hooks/useChatStream";
import { cn } from "@/lib/utils";

interface ToolActivityBlockProps {
  activity: ToolActivity;
}

export function ToolActivityBlock({ activity }: ToolActivityBlockProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
      <Wrench className="w-3 h-3" />
      <span className="font-medium">{activity.tool}</span>
      {activity.preview && (
        <span className="text-muted-foreground/70 truncate max-w-[200px]">
          {activity.preview}
        </span>
      )}
      {activity.status === "running" && (
        <Loader2 className="w-3 h-3 animate-spin ml-auto" />
      )}
      {activity.status === "completed" && (
        <span className="ml-auto flex items-center gap-1">
          <Check
            className={cn(
              "w-3 h-3",
              activity.duration !== undefined && "text-green-500",
            )}
          />
          {activity.duration !== undefined && (
            <span>{activity.duration.toFixed(1)}s</span>
          )}
        </span>
      )}
      {activity.status === "error" && (
        <X className="w-3 h-3 ml-auto text-destructive" />
      )}
    </div>
  );
}
