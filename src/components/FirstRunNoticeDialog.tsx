import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettingsQuery } from "@/lib/query";
import { settingsApi } from "@/lib/api";

/** 首次运行欢迎提示：可通过 firstRun 标志自动弹出，也可通过 forceOpen 手动触发 */
export function FirstRunNoticeDialog({
  forceOpen = false,
  onForceClose,
}: {
  forceOpen?: boolean;
  onForceClose?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useSettingsQuery();

  // 首次运行检查：后端启动时已经决定好要不要弹
  const isFirstRun =
    settings != null && settings.firstRunNoticeConfirmed !== true;

  // 对话框打开状态：首次运行 或 手动触发
  const isOpen = isFirstRun || forceOpen;

  const handleAcknowledge = async () => {
    if (!settings) return;

    // 如果是首次运行，保存确认标志
    if (isFirstRun) {
      try {
        const { webdavSync: _, ...rest } = settings;
        await settingsApi.save({ ...rest, firstRunNoticeConfirmed: true });
        await queryClient.invalidateQueries({ queryKey: ["settings"] });
      } catch (error) {
        console.error("Failed to save firstRunNoticeConfirmed:", error);
      }
    }

    // 如果是手动触发，调用回调
    if (forceOpen && onForceClose) {
      onForceClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void handleAcknowledge();
      }}
    >
      <DialogContent className="max-w-md" zIndex="top">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            {t("firstRunNotice.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-6 py-5">
          <DialogDescription className="whitespace-pre-line leading-relaxed">
            {t("firstRunNotice.bodyDefault")}
          </DialogDescription>
          <DialogDescription className="whitespace-pre-line leading-relaxed">
            {t("firstRunNotice.bodyOfficial")}
          </DialogDescription>
        </div>
        <DialogFooter>
          <Button onClick={handleAcknowledge}>
            {t("firstRunNotice.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
