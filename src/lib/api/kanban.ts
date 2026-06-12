import { invoke } from "@tauri-apps/api/core";
import type {
  KanbanBoard,
  KanbanTask,
  CreateBoardInput,
  CreateTaskInput,
  UpdateTaskInput,
} from "@/types";

export interface ThreadMessage {
  task_id: string;
  task_title: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ThreadMessagesResponse {
  task_id: string;
  task_title: string;
  task_count: number;
  message_count: number;
  messages: ThreadMessage[];
}

export const kanbanApi = {
  // ============================================================================
  // Board Management
  // ============================================================================

  listBoards: async (): Promise<KanbanBoard[]> => {
    return await invoke("listKanbanBoards");
  },

  createBoard: async (input: CreateBoardInput): Promise<KanbanBoard> => {
    return await invoke("createKanbanBoard", { input });
  },

  getBoard: async (slug: string): Promise<KanbanBoard> => {
    return await invoke("getKanbanBoard", { slug });
  },

  deleteBoard: async (slug: string): Promise<void> => {
    return await invoke("deleteKanbanBoard", { slug });
  },

  // ============================================================================
  // Task Management
  // ============================================================================

  listTasks: async (boardSlug: string): Promise<KanbanTask[]> => {
    return await invoke<KanbanTask[]>("listKanbanTasks", { boardSlug });
  },

  createTask: async (
    boardSlug: string,
    input: CreateTaskInput,
  ): Promise<KanbanTask> => {
    return await invoke("createKanbanTask", { boardSlug, input });
  },

  updateTask: async (
    boardSlug: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<KanbanTask> => {
    return await invoke("updateKanbanTask", { boardSlug, taskId, input });
  },

  deleteTask: async (boardSlug: string, taskId: string): Promise<void> => {
    return await invoke("deleteKanbanTask", { boardSlug, taskId });
  },

  getTask: async (boardSlug: string, taskId: string): Promise<KanbanTask> => {
    return await invoke("getKanbanTask", { boardSlug, taskId });
  },

  // ============================================================================
  // Dependency Management
  // ============================================================================

  linkTasks: async (
    boardSlug: string,
    parentId: string,
    childId: string,
  ): Promise<void> => {
    return await invoke("linkKanbanTasks", { boardSlug, parentId, childId });
  },

  unlinkTasks: async (
    boardSlug: string,
    parentId: string,
    childId: string,
  ): Promise<void> => {
    return await invoke("unlinkKanbanTasks", { boardSlug, parentId, childId });
  },

  resetTask: async (boardSlug: string, taskId: string): Promise<unknown> => {
    return await invoke("resetKanbanTask", { boardSlug, taskId });
  },

  unblockTask: async (boardSlug: string, taskId: string): Promise<unknown> => {
    return await invoke("unblockKanbanTask", { boardSlug, taskId });
  },

  getTaskEvents: async (boardSlug: string, taskId: string): Promise<unknown> => {
    return await invoke("getTaskEvents", { boardSlug, taskId });
  },

  getParents: async (
    boardSlug: string,
    taskId: string,
  ): Promise<KanbanTask[]> => {
    return await invoke("getTaskParents", { boardSlug, taskId });
  },

  getChildren: async (
    boardSlug: string,
    taskId: string,
  ): Promise<KanbanTask[]> => {
    return await invoke("getTaskChildren", { boardSlug, taskId });
  },

  // ============================================================================
  // Task Conversation
  // ============================================================================

  getTaskRuns: async (boardSlug: string, taskId: string): Promise<unknown> => {
    return await invoke("getTaskRuns", { boardSlug, taskId });
  },

  getTaskConversation: async (
    boardSlug: string,
    taskId: string,
  ): Promise<unknown> => {
    return await invoke("getTaskConversation", { boardSlug, taskId });
  },

  getTaskThreadMessages: async (
    boardSlug: string,
    taskId: string,
    roles?: string,
  ): Promise<ThreadMessagesResponse> => {
    return await invoke("getTaskThreadMessages", { boardSlug, taskId, roles });
  },

  // ============================================================================
  // Workflow Trigger
  // ============================================================================

  triggerBoard: async (
    boardSlug: string,
    options?: {
      assignee?: string;
      max_tasks?: number;
      once?: boolean;
      initial_prompt?: string;
    },
  ): Promise<{
    message: string;
    board: string;
    assignee?: string;
    processed: number;
    tasks?: Array<{ id: string; title: string; status: string }>;
    errors?: unknown;
  }> => {
    return await invoke("triggerKanbanBoard", {
      boardSlug,
      input: options || null,
    });
  },

  // ============================================================================
  // Batch Operations
  // ============================================================================

  batchDeleteTasks: async (
    boardSlug: string,
    taskIds: string[],
  ): Promise<{
    success_count: number;
    failed_count: number;
    errors: string[];
  }> => {
    return await invoke("batchDeleteKanbanTasks", { boardSlug, taskIds });
  },

  batchResetTasks: async (
    boardSlug: string,
    taskIds: string[],
  ): Promise<{
    success_count: number;
    failed_count: number;
    errors: string[];
  }> => {
    return await invoke("batchResetKanbanTasks", { boardSlug, taskIds });
  },

  batchExecuteTasks: async (
    boardSlug: string,
    taskIds: string[],
  ): Promise<{
    success_count: number;
    failed_count: number;
    errors: string[];
  }> => {
    return await invoke("batchExecuteKanbanTasks", { boardSlug, taskIds });
  },
};
