import { useState } from "react";
import {
  useBoards,
  useTasks,
  useResetTask,
  useUnblockTask,
  useDeleteBoard,
  useBatchDeleteTasks,
  useBatchResetTasks,
  useBatchExecuteTasks,
} from "@/hooks/useKanban";
import { Button } from "@/components/ui/button";
import {
  Plus,
  RefreshCw,
  Trello as KanbanIcon,
  Workflow,
  LayoutGrid,
} from "lucide-react";
import { BoardSidebar } from "./BoardSidebar";
import { KanbanBoard } from "./KanbanBoard";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskThreadPanel } from "./TaskThreadPanel";
import { CreateBoardDialog } from "./CreateBoardDialog";
import { TaskFlowView } from "./TaskFlowView";

export function KanbanPage() {
  const [selectedBoardSlug, setSelectedBoardSlug] = useState<string | null>(
    null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "flow">("kanban");
  const [flowRefreshKey, setFlowRefreshKey] = useState(0);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

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

  // Always call hook, but it will only work when boardSlug is set
  const resetMutation = useResetTask(selectedBoardSlug || "");
  const unblockMutation = useUnblockTask(selectedBoardSlug || "");
  const deleteBoardMutation = useDeleteBoard();
  const batchDeleteMutation = useBatchDeleteTasks(selectedBoardSlug || "");
  const batchResetMutation = useBatchResetTasks(selectedBoardSlug || "");
  const batchExecuteMutation = useBatchExecuteTasks(selectedBoardSlug || "");

  const selectedTask = tasks.find(
    (t) => (t.id || t.task_id) === selectedTaskId,
  );
  const selectedBoard = boards.find((b) => b.slug === selectedBoardSlug);

  // Auto-select first board if none selected
  if (!selectedBoardSlug && boards.length > 0 && !boardsLoading) {
    setSelectedBoardSlug(boards[0].slug);
  }

  const handleResetTask = async (taskId: string) => {
    if (!confirm("确定要重置此任务及其所有子任务吗？")) return;
    await resetMutation.mutateAsync(taskId);
  };

  const handleExecuteTask = async (taskId: string) => {
    if (!selectedBoardSlug) return;

    const task = tasks.find((t) => (t.id || t.task_id) === taskId);
    if (!task) return;

    if (!confirm(`确定要执行任务"${task.title}"吗？`)) return;

    // Execute single task via batch execute
    await batchExecuteMutation.mutateAsync([taskId]);
  };

  const handleUnblockTask = async (taskId: string) => {
    await unblockMutation.mutateAsync(taskId);
  };

  const handleBatchDelete = async (taskIds: string[]) => {
    await batchDeleteMutation.mutateAsync(taskIds);
  };

  const handleBatchReset = async (taskIds: string[]) => {
    await batchResetMutation.mutateAsync(taskIds);
  };

  const handleBatchExecute = async (taskIds: string[]) => {
    await batchExecuteMutation.mutateAsync(taskIds);
  };

  const handleDeleteBoard = async (slug: string) => {
    await deleteBoardMutation.mutateAsync(slug);
    // 如果删除的是当前选中的看板，清除选择
    if (slug === selectedBoardSlug) {
      setSelectedBoardSlug(null);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar - Board List */}
      <BoardSidebar
        boards={boards}
        selectedSlug={selectedBoardSlug}
        onSelect={setSelectedBoardSlug}
        onCreate={() => setCreateBoardOpen(true)}
        onDelete={handleDeleteBoard}
        isLoading={boardsLoading}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{selectedTask?.status === "done" && selectedBoardSlug ? (
          <TaskThreadPanel
            task={selectedTask}
            boardSlug={selectedBoardSlug}
            onClose={() => setSelectedTaskId(null)}
          />
        ) : (<>
        {/* Header */}
        <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">
              {selectedBoard?.displayName || selectedBoard?.name || "看板管理"}
            </h1>
            {selectedBoardSlug && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refetchBoards();
                  void refetchTasks();
                  // 强制流程图重新加载
                  setFlowRefreshKey((k) => k + 1);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                刷新
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedBoardSlug && (
              <>
                <Button
                  size="sm"
                  variant={viewMode === "flow" ? "default" : "outline"}
                  onClick={() => { setViewMode("flow"); setSelectedTaskId(null); }}
                >
                  <Workflow className="h-4 w-4 mr-1" />
                  构建流程图
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "kanban" ? "default" : "outline"}
                  onClick={() => setViewMode("kanban")}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  看板视图
                </Button>
                {viewMode === "kanban" && (
                  <Button
                    size="sm"
                    variant={isSelectionMode ? "default" : "outline"}
                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                  >
                    批量操作
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Main Content - Kanban Board or Flow View */}
        {selectedBoardSlug ? (
          viewMode === "kanban" ? (
            <KanbanBoard
              tasks={tasks}
              isLoading={tasksLoading}
              onSelectTask={setSelectedTaskId}
              onResetTask={handleResetTask}
              onExecuteTask={handleExecuteTask}
              onUnblockTask={handleUnblockTask}
              onBatchDelete={handleBatchDelete}
              onBatchReset={handleBatchReset}
              onBatchExecute={handleBatchExecute}
              isSelectionMode={isSelectionMode}
              onSelectionModeChange={setIsSelectionMode}
            />
          ) : (
            <TaskFlowView
              key={flowRefreshKey}
              boardSlug={selectedBoardSlug}
              tasks={tasks}
              onSelectTask={setSelectedTaskId}
            />
          )
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
        </>)}
      </div>

      {/* Right Panel - Task Detail (non-done tasks) */}
      {selectedTask && selectedBoardSlug && selectedTask.status !== "done" && (
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
    </div>
  );
}
