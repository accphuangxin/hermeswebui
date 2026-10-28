use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        "download".to_string()
    } else {
        cleaned.to_string()
    }
}

/// 内嵌页面（智能采购）导出附件：接收页面侧捕获的 Blob 字节，
/// 弹出系统“另存为”对话框，由用户选择保存位置。
///
/// 返回 `Ok(None)` 表示用户取消了保存。
#[tauri::command]
pub async fn save_download_file(
    app: tauri::AppHandle,
    fileName: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let file_name = sanitize_file_name(&fileName);
    log::info!("保存下载文件: {file_name}，{} 字节", bytes.len());

    let mut dialog = app.dialog().file().set_file_name(file_name);

    if let Ok(dir) = app.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }

    let Some(path) = dialog.blocking_save_file() else {
        log::info!("用户取消了保存");
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|e| format!("无效的保存路径: {e}"))?;

    let write_path = path.clone();
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&write_path, &bytes))
        .await
        .map_err(|e| format!("写入文件失败: {e}"))?
        .map_err(|e| format!("写入文件失败: {e}"))?;

    log::info!("下载文件已保存: {}", path.display());
    Ok(Some(path.to_string_lossy().to_string()))
}
