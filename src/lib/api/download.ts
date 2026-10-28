import { invoke } from "@tauri-apps/api/core";

/**
 * 调用系统“另存为”对话框保存下载内容。
 * 返回最终保存路径；用户取消时为 null。
 */
export async function saveDownloadedFile(
  fileName: string,
  bytes: Uint8Array,
): Promise<string | null> {
  return invoke<string | null>("save_download_file", {
    fileName,
    bytes: Array.from(bytes),
  });
}
