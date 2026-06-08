import { invoke } from "@tauri-apps/api/core";
import type {
  KanbanBoard,
  KanbanTask,
  CreateBoardInput,
  CreateTaskInput,
  UpdateTaskInput,
} from "@/types";

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

  // ============================================================================
  // Task Management
  // ============================================================================

  listTasks: async (boardSlug: string): Promise<KanbanTask[]> => {
    return await invoke("listKanbanTasks", { boardSlug });
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
};
