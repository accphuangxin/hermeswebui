import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code2, Eye, Save, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { knowledgeApi, knowledgeKeys } from "@/lib/api/knowledge";
import { useDarkMode } from "@/hooks/useDarkMode";
import MarkdownEditor from "@/components/MarkdownEditor";
import { toast } from "sonner";
import { exportToWord, exportToPdf } from "./exportUtils";

type ViewMode = "edit" | "preview";

interface KnowledgeEditorProps {
  filePath: string | null;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function KnowledgeEditor({ filePath, onDirtyChange }: KnowledgeEditorProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [editContent, setEditContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const originalContentRef = useRef("");

  const { data, isLoading, isError } = useQuery({
    queryKey: filePath ? knowledgeKeys.file(filePath) : ["knowledge", "file", "__none__"],
    queryFn: () => knowledgeApi.readFile(filePath!),
    enabled: !!filePath,
    staleTime: 0,
  });

  useEffect(() => {
    if (data !== undefined) {
      // 如果用户正在编辑，不覆盖未保存的内容
      if (!isDirty) {
        setEditContent(data);
        originalContentRef.current = data;
      } else {
        // 只更新基准值（用于后续 dirty 判断），不覆盖当前编辑内容
        originalContentRef.current = data;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleChange = useCallback(
    (val: string) => {
      setEditContent(val);
      setIsDirty(val !== originalContentRef.current);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!filePath || saving || !isDirty) return;
    setSaving(true);
    try {
      await knowledgeApi.writeFile(filePath, editContent);
      originalContentRef.current = editContent;
      setIsDirty(false);
      queryClient.setQueryData(knowledgeKeys.file(filePath), editContent);
      toast.success(t("knowledge.saveSuccess"));
    } catch (e) {
      toast.error(t("knowledge.saveFailed") + ": " + String(e));
    } finally {
      setSaving(false);
    }
  }, [filePath, editContent, isDirty, saving, queryClient, t]);

  // Ctrl/Cmd+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && viewMode === "edit" && filePath) {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, viewMode, filePath]);

  const fileName = filePath ? filePath.split("/").pop() ?? filePath : "";

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
        <FileText className="w-12 h-12 opacity-20" />
        <p className="text-sm font-medium">{t("knowledge.emptyTitle")}</p>
        <p className="text-xs">{t("knowledge.emptyDescription")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 标题栏 */}
      <div className="h-10 border-b flex items-center gap-2 px-3 shrink-0 bg-background">
        <span className="text-sm font-medium truncate shrink min-w-0">
          {fileName}
          {isDirty && (
            <span className="ml-1 text-muted-foreground text-xs">●</span>
          )}
        </span>

        {/* 导出按钮：紧跟文件名 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 px-0 shrink-0">
              <Download className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            <DropdownMenuItem
              onClick={() => {
                void exportToWord(editContent, fileName).catch((e) =>
                  toast.error(t("knowledge.exportFailed") + ": " + String(e)),
                );
              }}
            >
              导出 Word (.docx)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void exportToPdf(editContent, fileName).catch((e) =>
                  toast.error(t("knowledge.exportFailed") + ": " + String(e)),
                );
              }}
            >
              导出 PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* 视图切换 */}
        <div className="flex items-center rounded-md border bg-muted p-0.5 gap-0.5 shrink-0">
          <Button
            size="sm"
            variant={viewMode === "edit" ? "secondary" : "ghost"}
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setViewMode("edit")}
          >
            <Code2 className="w-3 h-3" />
            {t("knowledge.viewRaw")}
          </Button>
          <Button
            size="sm"
            variant={viewMode === "preview" ? "secondary" : "ghost"}
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setViewMode("preview")}
          >
            <Eye className="w-3 h-3" />
            {t("knowledge.viewPreview")}
          </Button>
        </div>

        {viewMode === "edit" && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="h-7 px-3 text-xs shrink-0 gap-1"
          >
            <Save className="w-3 h-3" />
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        )}

      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t("common.loading")}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-full text-destructive text-sm">
            {t("knowledge.loadFailed")}
          </div>
        ) : viewMode === "edit" ? (
          <MarkdownEditor
            value={editContent}
            onChange={handleChange}
            darkMode={darkMode}
            className="flex-1 min-h-0"
            minHeight="100%"
            maxHeight="100%"
          />
        ) : (
          <ScrollArea className="h-full">
            <div
              className={cn(
                "p-6 prose prose-sm max-w-none",
                darkMode ? "prose-invert" : "",
              )}
            >
              {editContent ? (
                <Markdown remarkPlugins={[remarkGfm]}>{editContent}</Markdown>
              ) : (
                <p className="text-muted-foreground italic text-sm">
                  {t("knowledge.emptyFile")}
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
