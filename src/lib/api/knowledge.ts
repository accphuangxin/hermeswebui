import { invoke } from "@tauri-apps/api/core";

export interface KnowledgeEntry {
  name: string;
  relPath: string;
  isDir: boolean;
  sizeBytes: number;
  modifiedAt: number;
}

export const knowledgeApi = {
  listDir: (relPath: string): Promise<KnowledgeEntry[]> =>
    invoke<KnowledgeEntry[]>("knowledge_list_dir", { relPath }),

  readFile: (relPath: string): Promise<string> =>
    invoke<string>("knowledge_read_file", { relPath }),

  writeFile: (relPath: string, content: string): Promise<void> =>
    invoke<void>("knowledge_write_file", { relPath, content }),

  createFile: (relPath: string): Promise<void> =>
    invoke<void>("knowledge_create_file", { relPath }),

  createDir: (relPath: string): Promise<void> =>
    invoke<void>("knowledge_create_dir", { relPath }),

  rename: (relPath: string, newName: string): Promise<string> =>
    invoke<string>("knowledge_rename", { relPath, newName }),

  delete: (relPath: string): Promise<void> =>
    invoke<void>("knowledge_delete", { relPath }),

  deleteRecursive: (relPath: string): Promise<void> =>
    invoke<void>("knowledge_delete_recursive", { relPath }),

  getBasePath: (): Promise<string> =>
    invoke<string>("knowledge_get_base_path"),

  importFiles: (destRelPath: string): Promise<KnowledgeImportResult | null> =>
    invoke<KnowledgeImportResult | null>("knowledge_import_files", { destRelPath }),

  importFolder: (destRelPath: string): Promise<KnowledgeImportResult | null> =>
    invoke<KnowledgeImportResult | null>("knowledge_import_folder", { destRelPath }),
};

export interface KnowledgeImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export const knowledgeKeys = {
  dir: (relPath: string) => ["knowledge", "dir", relPath] as const,
  file: (relPath: string) => ["knowledge", "file", relPath] as const,
};
