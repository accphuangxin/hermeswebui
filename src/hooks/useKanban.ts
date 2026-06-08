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
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useBoard(slug: string | null) {
  return useQuery({
    queryKey: kanbanKeys.board(slug || ""),
    queryFn: () => kanbanApi.getBoard(slug!),
    enabled: !!slug,
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
    onError: (e: Error) => toast.error(e.message || "创建失败"),
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
      toast.success("依赖关系已建立");
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });
}

export function useTask(boardSlug: string | null, taskId: string | null) {
  return useQuery({
    queryKey: kanbanKeys.task(boardSlug || "", taskId || ""),
    queryFn: () => kanbanApi.getTask(boardSlug!, taskId!),
    enabled: !!boardSlug && !!taskId,
  });
}
