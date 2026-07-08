import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FilePlus, FolderPlus, RefreshCw, FileText, Folder, FolderInput, FileInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { knowledgeApi, knowledgeKeys } from "@/lib/api/knowledge";
import { KnowledgeTreeNode } from "./KnowledgeTreeNode";
import { toast } from "sonner";

interface KnowledgeTreeProps {
  className?: string;
  selectedPath: string | null;
  selectedIsDir: boolean;
  onSelectFile: (relPath: string) => void;
  onSelectDir: (relPath: string) => void;
  onDeletedFile: (relPath: string) => void;
}

interface InlineNewItem {
  type: "file" | "folder";
}

export function KnowledgeTree({
  className,
  selectedPath,
  selectedIsDir,
  onSelectFile,
  onSelectDir,
  onDeletedFile,
}: KnowledgeTreeProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [inlineNew, setInlineNew] = useState<InlineNewItem | null>(null);
  const [newName, setNewName] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  const { data: rootEntries, isLoading } = useQuery({
    queryKey: knowledgeKeys.dir(""),
    queryFn: () => knowledgeApi.listDir(""),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (inlineNew) {
      setNewName(inlineNew.type === "file" ? ".md" : "");
      setTimeout(() => {
        const input = newInputRef.current;
        if (!input) return;
        // 文件默认选中 .md 前的部分，文件夹全选
        if (inlineNew.type === "file") {
          input.focus();
          input.setSelectionRange(0, 0);
        } else {
          input.focus();
          input.select();
        }
      }, 0);
    }
  }, [inlineNew]);

  const handleToggleDir = (relPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  };

  const handleRefresh = (dirRelPath: string) => {
    queryClient.invalidateQueries({ queryKey: knowledgeKeys.dir(dirRelPath) });
  };

  // 根据当前选中项推断导入目标目录：
  // 选中文件夹 → 直接用该目录；选中文件 → 取其父目录；无选中 → 根目录
  const getImportDestDir = () => {
    if (!selectedPath) return "";
    if (selectedIsDir) return selectedPath;
    return selectedPath.includes("/")
      ? selectedPath.substring(0, selectedPath.lastIndexOf("/"))
      : "";
  };

  const handleImportFiles = async () => {
    const dest = getImportDestDir();
    try {
      const result = await knowledgeApi.importFiles(dest);
      if (!result) return;
      handleRefresh(dest);
      if (result.imported > 0) toast.success(t("knowledge.importSuccess", { count: result.imported }));
      if (result.errors.length > 0) toast.error(result.errors[0]);
    } catch (e) {
      toast.error(t("knowledge.importFailed") + ": " + String(e));
    }
  };

  const handleImportFolder = async () => {
    const dest = getImportDestDir();
    try {
      const result = await knowledgeApi.importFolder(dest);
      if (!result) return;
      handleRefresh(dest);
      if (result.imported > 0) toast.success(t("knowledge.importSuccess", { count: result.imported }));
      if (result.errors.length > 0) toast.error(result.errors[0]);
    } catch (e) {
      toast.error(t("knowledge.importFailed") + ": " + String(e));
    }
  };

  const commitNew = async () => {
    if (!inlineNew) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === ".md") {
      setInlineNew(null);
      return;
    }
    const finalName =
      inlineNew.type === "file" && !trimmed.endsWith(".md")
        ? trimmed + ".md"
        : trimmed;
    const destDir = getImportDestDir();
    const relPath = destDir ? `${destDir}/${finalName}` : finalName;
    setInlineNew(null);
    try {
      if (inlineNew.type === "file") {
        await knowledgeApi.createFile(relPath);
        handleRefresh(destDir);
        if (destDir) setExpandedDirs((prev) => new Set([...prev, destDir]));
        onSelectFile(relPath);
      } else {
        await knowledgeApi.createDir(relPath);
        handleRefresh(destDir);
      }
      toast.success(t("knowledge.createSuccess"));
    } catch (e) {
      toast.error(t("knowledge.createFailed") + ": " + String(e));
    }
  };

  const handleNewKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void commitNew(); }
    if (e.key === "Escape") { e.preventDefault(); setInlineNew(null); }
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {/* 头部操作栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0">
        <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("knowledge.title")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={t("knowledge.newFile")}
          onClick={() => setInlineNew({ type: "file" })}
        >
          <FilePlus className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={t("knowledge.newFolder")}
          onClick={() => setInlineNew({ type: "folder" })}
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={t("knowledge.importFiles")}
          onClick={() => void handleImportFiles()}
        >
          <FileInput className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={t("knowledge.importFolder")}
          onClick={() => void handleImportFolder()}
        >
          <FolderInput className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={t("common.refresh")}
          onClick={() => handleRefresh("")}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* 树形列表 */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* 内联新建输入行 */}
          {inlineNew && (
            <div className="flex items-center gap-1 py-0.5 pr-1 pl-2 bg-accent/30 rounded">
              <span className="w-3.5 shrink-0" />
              {inlineNew.type === "file"
                ? <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                : <Folder className="w-3.5 h-3.5 shrink-0 text-yellow-500" />}
              <input
                ref={newInputRef}
                className="flex-1 min-w-0 bg-background border border-ring rounded px-1 py-0 text-sm outline-none"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleNewKeyDown}
                onBlur={() => void commitNew()}
              />
            </div>
          )}

          {isLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("common.loading")}
            </p>
          )}
          {!isLoading && !inlineNew && rootEntries?.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">
              {t("knowledge.emptyRoot")}
            </p>
          )}
          {rootEntries?.map((entry) => (
            <KnowledgeTreeNode
              key={entry.relPath}
              entry={entry}
              depth={0}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onSelectFile={onSelectFile}
              onSelectDir={onSelectDir}
              onToggleDir={handleToggleDir}
              onRefresh={handleRefresh}
              onDeleteFile={onDeletedFile}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
