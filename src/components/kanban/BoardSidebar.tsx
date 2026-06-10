import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { KanbanBoard } from "@/types";

interface BoardSidebarProps {
  boards: KanbanBoard[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onCreate: () => void;
  onDelete?: (slug: string) => void;
  isLoading?: boolean;
}

export function BoardSidebar({
  boards,
  selectedSlug,
  onSelect,
  onCreate,
  onDelete,
  isLoading,
}: BoardSidebarProps) {
  return (
    <div className="w-[200px] border-r bg-muted/30 flex flex-col">
      <div className="h-14 px-3 border-b flex items-center justify-between shrink-0">
        <h3 className="text-sm font-medium">看板列表</h3>
        <Button size="icon" variant="ghost" onClick={onCreate}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-4">
              加载中...
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-4">
              暂无看板
            </div>
          ) : (
            boards.map((board) => (
              <div
                key={board.slug}
                className={cn(
                  "group relative rounded-md transition-colors",
                  selectedSlug === board.slug && "bg-accent",
                )}
              >
                <button
                  onClick={() => onSelect(board.slug)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    "hover:bg-accent",
                    selectedSlug === board.slug && "font-medium",
                    onDelete && "pr-8", // 为删除按钮留出空间
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{board.icon || "📋"}</span>
                    <span className="truncate flex-1">
                      {board.displayName || board.name}
                    </span>
                  </div>
                  {board.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {board.description}
                    </div>
                  )}
                </button>
                {onDelete && (
                  <button
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-accent flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        confirm(
                          `确定要删除看板"${board.displayName || board.name}"吗？此操作不可恢复。`,
                        )
                      ) {
                        onDelete(board.slug);
                      }
                    }}
                    aria-label="删除看板"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
