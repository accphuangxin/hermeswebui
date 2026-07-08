import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { knowledgeApi, knowledgeKeys, type KnowledgeEntry } from "@/lib/api/knowledge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";

interface KnowledgeTreeNodeProps {
  entry: KnowledgeEntry;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (relPath: string) => void;
  onSelectDir: (relPath: string) => void;
  onToggleDir: (relPath: string) => void;
  onRefresh: (dirRelPath: string) => void;
  onDeleteFile: (relPath: string) => void;
}

export function KnowledgeTreeNode({
  entry,
  depth,
  selectedPath,
  expandedDirs,
  onSelectFile,
  onSelectDir,
  onToggleDir,
  onRefresh,
  onDeleteFile,
}: KnowledgeTreeNodeProps) {
  const { t } = useTranslation();
  const isExpanded = expandedDirs.has(entry.relPath);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const { data: children } = useQuery({
    queryKey: knowledgeKeys.dir(entry.relPath),
    queryFn: () => knowledgeApi.listDir(entry.relPath),
    enabled: entry.isDir && isExpanded,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(entry.name);
      setTimeout(() => renameInputRef.current?.select(), 0);
    }
  }, [isRenaming, entry.name]);

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === entry.name) {
      setIsRenaming(false);
      return;
    }
    // 文件必须以 .md 结尾
    const finalName = !entry.isDir && !trimmed.endsWith(".md")
      ? trimmed + ".md"
      : trimmed;
    try {
      await knowledgeApi.rename(entry.relPath, finalName);
      const parentRelPath = entry.relPath.includes("/")
        ? entry.relPath.substring(0, entry.relPath.lastIndexOf("/"))
        : "";
      onRefresh(parentRelPath);
      if (selectedPath === entry.relPath) onDeleteFile(entry.relPath);
      toast.success(t("knowledge.renameSuccess"));
    } catch (e) {
      toast.error(t("knowledge.renameFailed") + ": " + String(e));
    } finally {
      setIsRenaming(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
    if (e.key === "Escape") { e.preventDefault(); setIsRenaming(false); }
  };

  const handleDelete = async () => {
    try {
      if (entry.isDir) {
        await knowledgeApi.deleteRecursive(entry.relPath);
      } else {
        await knowledgeApi.delete(entry.relPath);
      }
      const parentRelPath = entry.relPath.includes("/")
        ? entry.relPath.substring(0, entry.relPath.lastIndexOf("/"))
        : "";
      onRefresh(parentRelPath);
      if (selectedPath === entry.relPath || selectedPath?.startsWith(entry.relPath + "/")) {
        onDeleteFile(entry.relPath);
      }
      toast.success(t("knowledge.deleteSuccess"));
    } catch (e) {
      toast.error(t("knowledge.deleteFailed") + ": " + String(e));
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <div className="group">
        <div
          className={cn(
            "flex items-center gap-1 py-0.5 pr-1 rounded text-sm select-none",
            isRenaming
              ? "bg-accent/30"
              : "cursor-pointer hover:bg-accent/50",
            !entry.isDir && !isRenaming && selectedPath === entry.relPath &&
              "bg-accent text-accent-foreground",
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            if (isRenaming) return;
            if (entry.isDir) {
              onToggleDir(entry.relPath);
              onSelectDir(entry.relPath);
            } else {
              onSelectFile(entry.relPath);
            }
          }}
        >
          {/* 图标 */}
          {entry.isDir ? (
            <>
              <span className="shrink-0 text-muted-foreground">
                {isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
              <span className="shrink-0">
                {isExpanded
                  ? <FolderOpen className="w-3.5 h-3.5 text-yellow-500" />
                  : <Folder className="w-3.5 h-3.5 text-yellow-500" />}
              </span>
            </>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </>
          )}

          {/* 名称 / 重命名输入框 */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="flex-1 min-w-0 bg-background border border-ring rounded px-1 py-0 text-sm outline-none"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => void commitRename()}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{entry.name}</span>
          )}

          {/* 操作菜单 */}
          {!isRenaming && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-0.5 rounded hover:bg-accent"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-2" />
                  {t("knowledge.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  {t("knowledge.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {entry.isDir && isExpanded && children && children.length > 0 && (
          <div>
            {children.map((child) => (
              <KnowledgeTreeNode
                key={child.relPath}
                entry={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedDirs={expandedDirs}
                onSelectFile={onSelectFile}
                onSelectDir={onSelectDir}
                onToggleDir={onToggleDir}
                onRefresh={onRefresh}
                onDeleteFile={onDeleteFile}
              />
            ))}
          </div>
        )}
        {entry.isDir && isExpanded && children && children.length === 0 && (
          <div
            className="text-xs text-muted-foreground py-0.5 italic"
            style={{ paddingLeft: `${22 + (depth + 1) * 14}px` }}
          >
            {t("knowledge.emptyFolder")}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={t("knowledge.deleteConfirmTitle")}
        message={
          entry.isDir
            ? t("knowledge.deleteFolderMessage", { name: entry.name })
            : t("knowledge.deleteFileMessage", { name: entry.name })
        }
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
