import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { KnowledgeTree } from "./KnowledgeTree";
import { KnowledgeEditor } from "./KnowledgeEditor";
import { KnowledgeChat } from "./KnowledgeChat";
import { knowledgeKeys } from "@/lib/api/knowledge";

export function KnowledgePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedIsDir, setSelectedIsDir] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pendingIsDir, setPendingIsDir] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const isDirtyRef = useRef(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
  }, []);

  const handleSelectFile = useCallback(
    (path: string) => {
      if (isDirtyRef.current && path !== selectedPath) {
        setPendingPath(path);
        setPendingIsDir(false);
        setShowUnsavedDialog(true);
      } else {
        setSelectedPath(path);
        setSelectedIsDir(false);
      }
    },
    [selectedPath],
  );

  const handleSelectDir = useCallback((path: string) => {
    setSelectedPath(path);
    setSelectedIsDir(true);
  }, []);

  const handleDeletedFile = useCallback(
    (relPath: string) => {
      if (selectedPath === relPath || selectedPath?.startsWith(relPath + "/")) {
        setSelectedPath(null);
        setSelectedIsDir(false);
      }
    },
    [selectedPath],
  );

  const handleConfirmSwitch = () => {
    setShowUnsavedDialog(false);
    if (pendingPath !== null) {
      setSelectedPath(pendingPath);
      setSelectedIsDir(pendingIsDir);
      setPendingPath(null);
    }
  };

  const handleCancelSwitch = () => {
    setShowUnsavedDialog(false);
    setPendingPath(null);
  };

  // Chat 通知文件被修改 → 使编辑器 query 失效，触发重新读取文件
  const handleFileChanged = useCallback(() => {
    if (selectedPath && !selectedIsDir) {
      void queryClient.refetchQueries({ queryKey: knowledgeKeys.file(selectedPath) });
    }
  }, [queryClient, selectedPath, selectedIsDir]);

  const activeFilePath = selectedIsDir ? null : selectedPath;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        {/* 左侧文件树 */}
        <ResizablePanel defaultSize="18%" minSize="12%" maxSize="35%">
          <KnowledgeTree
            className="h-full border-r overflow-hidden"
            selectedPath={selectedPath}
            selectedIsDir={selectedIsDir}
            onSelectFile={handleSelectFile}
            onSelectDir={handleSelectDir}
            onDeletedFile={handleDeletedFile}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* 中间编辑/预览区 */}
        <ResizablePanel defaultSize="52%" minSize="25%">
          <div className="h-full flex flex-col overflow-hidden">
            <KnowledgeEditor
              key={activeFilePath ?? "__empty__"}
              filePath={activeFilePath}
              onDirtyChange={handleDirtyChange}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* 右侧 Chat 面板 */}
        <ResizablePanel defaultSize="30%" minSize="20%" maxSize="50%">
          <div className="h-full flex flex-col overflow-hidden">
            <KnowledgeChat
              filePath={activeFilePath}
              onFileChanged={handleFileChanged}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title={t("knowledge.unsavedTitle")}
        message={t("knowledge.unsavedMessage")}
        confirmText={t("knowledge.discardChanges")}
        cancelText={t("common.cancel")}
        variant="destructive"
        onConfirm={handleConfirmSwitch}
        onCancel={handleCancelSwitch}
      />
    </div>
  );
}
