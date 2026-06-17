import { X, Download } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface ChatMarkdownPreviewProps {
  markdownContent: string;
  onClose: () => void;
  onExport?: () => void;
}

export function ChatMarkdownPreview({ markdownContent, onClose, onExport }: ChatMarkdownPreviewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="h-10 px-3 border-b flex items-center justify-between shrink-0 bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground">Markdown 预览</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
          <Markdown remarkPlugins={[remarkGfm]}>{markdownContent}</Markdown>
        </div>
      </ScrollArea>
      {onExport && (
        <div className="shrink-0 border-t p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={onExport}
          >
            <Download className="w-3.5 h-3.5" />
            导出文件
          </Button>
        </div>
      )}
    </div>
  );
}
