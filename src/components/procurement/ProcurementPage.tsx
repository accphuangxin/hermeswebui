import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { SMART_PURCHASE } from "@/config/appConfig";
import { saveDownloadedFile } from "@/lib/api/download";

interface DownloadFinishedPayload {
  url: string;
  path: string | null;
  success: boolean;
}

interface CapturedDownload {
  type: string;
  filename?: string;
  bytes?: ArrayBuffer;
}

export function ProcurementPage() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 内嵌页面的下载由 Rust 端 on_download 处理器接管，这里只负责在完成后给出提示。
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    listen<DownloadFinishedPayload>("download-finished", (event) => {
      const { path, success } = event.payload;
      if (success) {
        toast.success(
          path
            ? t("procurement.downloadSuccess", {
                path,
                defaultValue: "已保存到：{{path}}",
              })
            : t("procurement.downloaded", { defaultValue: "附件已下载" }),
          // 路径较长，延长展示时间方便复制/查看
          { duration: path ? 10000 : 5000 },
        );
      } else {
        toast.error(
          t("procurement.downloadFailed", { defaultValue: "导出失败，请重试" }),
        );
      }
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [t]);

  // 注入到 iframe 的脚本截获 Blob 下载后通过 postMessage 发过来，
  // 这里弹出系统“另存为”对话框，由用户选择保存位置。
  useEffect(() => {
    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(SMART_PURCHASE.url, window.location.href).origin;
    } catch {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data as CapturedDownload | null;
      if (!data || data.type !== "__hermes_download__") return;
      if (event.origin !== expectedOrigin) return;
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) return;
      if (!(data.bytes instanceof ArrayBuffer)) return;

      const fileName =
        typeof data.filename === "string" && data.filename.trim()
          ? data.filename
          : "download";

      saveDownloadedFile(fileName, new Uint8Array(data.bytes))
        .then((path) => {
          if (path) {
            toast.success(
              t("procurement.downloadSuccess", {
                path,
                defaultValue: "已保存到：{{path}}",
              }),
              { duration: 10000 },
            );
          }
        })
        .catch(() => {
          toast.error(
            t("procurement.downloadFailed", {
              defaultValue: "导出失败，请重试",
            }),
          );
        });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [t]);

  return (
    <div className="relative h-full min-h-0">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t("procurement.loading", { defaultValue: "加载中…" })}
          </span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={SMART_PURCHASE.url}
        title={t("procurement.title", { defaultValue: "智能采购" })}
        className="h-full w-full border-0"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
