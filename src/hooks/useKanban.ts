import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { kanbanApi } from "@/lib/api/kanban";
import { toast } from "sonner";
import type {
  CreateBoardInput,
  CreateTaskInput,
  UpdateTaskInput,
} from "@/types";

// ============================================================================
// Query Keys
// ============================================================================

export const kanbanKeys = {
  all: ["kanban"] as const,
  boards: ["kanban", "boards"] as const,
  board: (slug: string) => ["kanban", "board", slug] as const,
  tasks: (board: string) => ["kanban", "tasks", board] as const,
  task: (board: string, id: string) => ["kanban", "task", board, id] as const,
};

// ============================================================================
// Board Hooks
// ============================================================================

export function useBoards() {
  return useQuery({
    queryKey: kanbanKeys.boards,
    queryFn: () => kanbanApi.listBoards(),
    staleTime: 60000, // 1分钟
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBoardInput) => kanbanApi.createBoard(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kanbanKeys.boards });
      toast.success("看板创建成功");
    },
    onError: (e: Error) => {
      console.error("操作失败:", e);
      toast.error(`操作失败: ${e.message || "未知错误"}`);
    },
  });
}

export function useBoard(slug: string | null) {
  return useQuery({
    queryKey: kanbanKeys.board(slug || ""),
    queryFn: () => kanbanApi.getBoard(slug!),
    enabled: !!slug,
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) => kanbanApi.deleteBoard(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kanbanKeys.boards });
      toast.success("看板删除成功");
    },
    onError: (e: Error) => {
      console.error("删除看板失败:", e);
      toast.error(`删除失败: ${e.message || "未知错误"}`);
    },
  });
}

// ============================================================================
// Task Hooks
// ============================================================================

export function useTasks(boardSlug: string | null) {
  return useQuery({
    queryKey: kanbanKeys.tasks(boardSlug || ""),
    queryFn: () => kanbanApi.listTasks(boardSlug!),
    enabled: !!boardSlug,
    refetchInterval: 5000, // 5秒自动刷新
    staleTime: 0, // 始终认为数据过期，允许自动刷新
  });
}

export function useCreateTask(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      kanbanApi.createTask(boardSlug, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      toast.success("任务创建成功");
    },
    onError: (e: Error) => {
      console.error("创建任务失败:", e);
      const errorMsg = e.message || "未知错误";
      toast.error(`创建任务失败: ${errorMsg}`);
    },
  });
}

export function useUpdateTask(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string;
      input: UpdateTaskInput;
    }) => kanbanApi.updateTask(boardSlug, taskId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      toast.success("任务更新成功");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteTask(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => kanbanApi.deleteTask(boardSlug, taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      toast.success("任务删除成功");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useLinkTasks(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      parentId,
      childId,
    }: {
      parentId: string;
      childId: string;
    }) => kanbanApi.linkTasks(boardSlug, parentId, childId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      // 静默成功
    },
    onError: () => {
      // 静默失败，不打扰用户
      // 连线会保留在界面上，批量生成时会重试
    },
  });
}

export function useUnlinkTasks(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      parentId,
      childId,
    }: {
      parentId: string;
      childId: string;
    }) => kanbanApi.unlinkTasks(boardSlug, parentId, childId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      toast.success("依赖关系已删除");
    },
    onError: (error: Error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });
}

export function useResetTask(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => kanbanApi.resetTask(boardSlug, taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      toast.success("任务已重置");
    },
    onError: (error: Error) => {
      toast.error(`重置失败: ${error.message}`);
    },
  });
}

export function useUnblockTask(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => kanbanApi.unblockTask(boardSlug, taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      toast.success("任务审核通过，已恢复就绪状态");
    },
    onError: (error: Error) => {
      toast.error(`审核失败: ${error.message}`);
    },
  });
}

export function useTaskRuns(boardSlug: string | null, taskId: string | null) {
  return useQuery({
    queryKey: [...kanbanKeys.task(boardSlug || "", taskId || ""), "runs"],
    queryFn: () => kanbanApi.getTaskRuns(boardSlug!, taskId!),
    enabled: !!boardSlug && !!taskId,
    refetchInterval: 5000, // 执行中任务轮询
    staleTime: 3000,
  });
}

export function useTaskEvents(boardSlug: string | null, taskId: string | null) {
  return useQuery({
    queryKey: [...kanbanKeys.task(boardSlug || "", taskId || ""), "events"],
    queryFn: () => kanbanApi.getTaskEvents(boardSlug!, taskId!),
    enabled: !!boardSlug && !!taskId,
    staleTime: 5000,
  });
}

export function useTask(boardSlug: string | null, taskId: string | null) {
  return useQuery({
    queryKey: kanbanKeys.task(boardSlug || "", taskId || ""),
    queryFn: () => kanbanApi.getTask(boardSlug!, taskId!),
    enabled: !!boardSlug && !!taskId,
  });
}

// ============================================================================
// Task Conversation Hook
// ============================================================================

export function useTaskConversation(
  boardSlug: string | null,
  taskId: string | null,
) {
  return useQuery({
    queryKey: [
      ...kanbanKeys.task(boardSlug || "", taskId || ""),
      "conversation",
    ],
    queryFn: () => kanbanApi.getTaskConversation(boardSlug!, taskId!),
    enabled: !!boardSlug && !!taskId,
    staleTime: 30000, // 30秒缓存
  });
}

export function useTaskThreadMessages(
  boardSlug: string | null,
  taskId: string | null,
  roles?: string,
) {
  return useQuery({
    queryKey: [
      ...kanbanKeys.task(boardSlug || "", taskId || ""),
      "thread-messages",
      roles ?? "all",
    ],
    queryFn: () =>
      kanbanApi.getTaskThreadMessages(boardSlug!, taskId!, roles ?? "all"),
    enabled: !!boardSlug && !!taskId,
    staleTime: 30000,
  });
}

// ============================================================================
// Trigger Workflow Hook
// ============================================================================

export function useTriggerBoard(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: {
      assignee?: string;
      max_tasks?: number;
      once?: boolean;
      initial_prompt?: string;
      task_id?: string;
    }) => {
      if (!boardSlug) {
        throw new Error("未选择看板");
      }
      return kanbanApi.triggerBoard(boardSlug, options);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      const count = data.processed || 0;
      if (count > 0) {
        toast.success(`成功触发 ${count} 个任务的工作流`);
      } else {
        toast.info("当前没有可触发的任务");
      }
    },
    onError: (e: Error) => {
      console.error("[useTriggerBoard] 触发失败:", e);
      const message = e.message || String(e);
      // 尝试从错误消息中提取更详细的信息
      if (message.includes("HTTP 404")) {
        toast.error("看板不存在或 API 不可用");
      } else if (message.includes("HTTP 500")) {
        toast.error("服务器错误，请检查后端服务");
      } else if (message.includes("request failed")) {
        toast.error("无法连接到看板服务，请检查服务是否运行");
      } else {
        toast.error(`触发失败: ${message}`, {
          duration: 5000,
          description: "请检查控制台获取详细信息",
        });
      }
    },
  });
}

// ============================================================================
// Batch Operations Hooks
// ============================================================================

export function useBatchDeleteTasks(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskIds: string[]) =>
      kanbanApi.batchDeleteTasks(boardSlug, taskIds),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      if (data.success_count > 0) {
        toast.success(`成功删除 ${data.success_count} 个任务`);
      }
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} 个任务删除失败`, {
          description: data.errors.join("\n"),
        });
      }
    },
    onError: (e: Error) => toast.error(`批量删除失败: ${e.message}`),
  });
}

export function useBatchResetTasks(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskIds: string[]) =>
      kanbanApi.batchResetTasks(boardSlug, taskIds),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      if (data.success_count > 0) {
        toast.success(`成功重置 ${data.success_count} 个任务`);
      }
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} 个任务重置失败`, {
          description: data.errors.join("\n"),
        });
      }
    },
    onError: (e: Error) => toast.error(`批量重置失败: ${e.message}`),
  });
}

export function useBatchExecuteTasks(boardSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskIds: string[]) =>
      kanbanApi.batchExecuteTasks(boardSlug, taskIds),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: kanbanKeys.tasks(boardSlug),
      });
      if (data.success_count > 0) {
        toast.success(`成功触发 ${data.success_count} 个任务的执行`);
      }
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} 个任务触发失败`, {
          description: data.errors.join("\n"),
        });
      }
    },
    onError: (e: Error) => toast.error(`批量执行失败: ${e.message}`),
  });
}
