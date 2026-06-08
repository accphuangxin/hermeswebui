import { useState } from "react";
import { useBoards, useTasks } from "@/hooks/useKanban";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Trello as KanbanIcon } from "lucide-react";
import { BoardSidebar } from "./BoardSidebar";
import { KanbanBoard } from "./KanbanBoard";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { CreateBoardDialog } from "./CreateBoardDialog";
import { CreateTaskDialog } from "./CreateTaskDialog";

export function KanbanPage() {
  const [selectedBoardSlug, setSelectedBoardSlug] = useState<string | null>(
    null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const {
    data: boards = [],
    isLoading: boardsLoading,
    refetch: refetchBoards,
  } = useBoards();
  const {
    data: tasks = [],
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useTasks(selectedBoardSlug);

  const selectedTask = tasks.find(
    (t) => (t.id || t.task_id) === selectedTaskId,
  );
  const selectedBoard = boards.find((b) => b.slug === selectedBoardSlug);

  // Auto-select first board if none selected
  if (!selectedBoardSlug && boards.length > 0 && !boardsLoading) {
    setSelectedBoardSlug(boards[0].slug);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar - Board List */}
      <BoardSidebar
        boards={boards}
        selectedSlug={selectedBoardSlug}
        onSelect={setSelectedBoardSlug}
        onCreate={() => setCreateBoardOpen(true)}
        isLoading={boardsLoading}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <KanbanIcon className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">
              {selectedBoard?.displayName || selectedBoard?.name || "看板管理"}
            </h1>
            {selectedBoard?.description && (
              <span className="text-sm text-muted-foreground">
                {selectedBoard.description}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchBoards();
                void refetchTasks();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>

            {selectedBoardSlug && (
              <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                新建任务
              </Button>
            )}
          </div>
        </div>

        {/* Kanban Board */}
        {selectedBoardSlug ? (
          <KanbanBoard
            tasks={tasks}
            isLoading={tasksLoading}
            onSelectTask={setSelectedTaskId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <KanbanIcon className="h-16 w-16 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-medium mb-1">暂无看板</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  创建您的第一个看板来开始管理任务
                </p>
                <Button onClick={() => setCreateBoardOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  创建看板
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Task Detail */}
      {selectedTask && selectedBoardSlug && (
        <TaskDetailPanel
          task={selectedTask}
          boardSlug={selectedBoardSlug}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* Dialogs */}
      <CreateBoardDialog
        open={createBoardOpen}
        onClose={() => setCreateBoardOpen(false)}
      />

      {selectedBoardSlug && (
        <CreateTaskDialog
          open={createTaskOpen}
          boardSlug={selectedBoardSlug}
          tasks={tasks}
          onClose={() => setCreateTaskOpen(false)}
        />
      )}
    </div>
  );
}
