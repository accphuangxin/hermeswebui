use crate::config::{get_home_dir, write_text_file};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use base64::Engine;

fn get_knowledge_dir() -> PathBuf {
    get_home_dir().join(".hermes-web").join("knowledge")
}

/// 解析并验证相对路径，防止路径穿越。
/// rel_path 为空字符串时返回 knowledge 根目录本身。
fn resolve_safe_path(rel_path: &str) -> Result<PathBuf, String> {
    let base = get_knowledge_dir();
    std::fs::create_dir_all(&base).map_err(|e| format!("无法创建知识库目录: {e}"))?;

    if rel_path.is_empty() {
        return base
            .canonicalize()
            .map_err(|e| format!("无法解析知识库根目录: {e}"));
    }

    // 拒绝包含 null 字节的路径
    if rel_path.contains('\0') {
        return Err("路径包含非法字符".to_string());
    }

    let candidate = base.join(rel_path);
    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("无法解析知识库根目录: {e}"))?;

    // 对父目录做 canonicalize，文件/目录本身可以不存在
    let (canonical_parent, file_name) = if candidate.exists() {
        (
            candidate
                .canonicalize()
                .map_err(|e| format!("无法解析路径: {e}"))?,
            None,
        )
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| "无效路径".to_string())?;
        let name = candidate
            .file_name()
            .ok_or_else(|| "无效文件名".to_string())?
            .to_owned();
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建父目录: {e}"))?;
        (
            parent
                .canonicalize()
                .map_err(|e| format!("无法解析父目录: {e}"))?,
            Some(name),
        )
    };

    if !canonical_parent.starts_with(&canonical_base) {
        return Err("路径不允许超出知识库目录范围".to_string());
    }

    let result = match file_name {
        Some(name) => canonical_parent.join(name),
        None => canonical_parent,
    };
    Ok(result)
}

/// 将绝对路径转换回相对于 knowledge 根的路径（用 / 分隔）
fn to_rel_path(abs_path: &std::path::Path) -> Result<String, String> {
    let base = get_knowledge_dir()
        .canonicalize()
        .map_err(|e| format!("无法解析知识库根目录: {e}"))?;
    abs_path
        .strip_prefix(&base)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .map_err(|_| "路径不在知识库目录内".to_string())
}

fn validate_item_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('.') {
        return Err("名称无效".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("名称中不允许包含路径分隔符或特殊字符".to_string());
    }
    Ok(())
}

fn validate_md_filename(name: &str) -> Result<(), String> {
    validate_item_name(name)?;
    if !name.ends_with(".md") {
        return Err("只支持 .md 文件".to_string());
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntry {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_at: u64,
}

/// 列出指定目录的直接子项（非递归）。rel_path="" 表示根目录。
#[tauri::command]
pub async fn knowledge_list_dir(rel_path: String) -> Result<Vec<KnowledgeEntry>, String> {
    let dir = resolve_safe_path(&rel_path)?;

    if !dir.exists() {
        return Ok(Vec::new());
    }
    if !dir.is_dir() {
        return Err(format!("{rel_path} 不是目录"));
    }

    let mut entries: Vec<KnowledgeEntry> = Vec::new();

    for entry in
        std::fs::read_dir(&dir).map_err(|e| format!("读取目录失败: {e}"))?
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        // 跳过隐藏文件/目录
        if name.starts_with('.') {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        // 只显示目录和 .md 文件
        if !meta.is_dir() && !name.ends_with(".md") {
            continue;
        }

        let abs_path = entry.path();
        let rel = to_rel_path(&abs_path).unwrap_or_else(|_| name.clone());
        let size_bytes = if meta.is_file() { meta.len() } else { 0 };
        let modified_at = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        entries.push(KnowledgeEntry {
            name,
            rel_path: rel,
            is_dir: meta.is_dir(),
            size_bytes,
            modified_at,
        });
    }

    // 文件夹在前，文件在后；各自按名称升序
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// 读取 .md 文件内容。
#[tauri::command]
pub async fn knowledge_read_file(rel_path: String) -> Result<String, String> {
    let path = resolve_safe_path(&rel_path)?;
    if !path.exists() {
        return Err(format!("文件不存在: {rel_path}"));
    }
    if path.is_dir() {
        return Err(format!("{rel_path} 是目录，不是文件"));
    }
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {e}"))
}

/// 原子写入 .md 文件（不存在时自动创建）。
#[tauri::command]
pub async fn knowledge_write_file(rel_path: String, content: String) -> Result<(), String> {
    let path = resolve_safe_path(&rel_path)?;
    // 确保父目录存在
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {e}"))?;
    }
    write_text_file(&path, &content).map_err(|e| format!("写入文件失败: {e}"))
}

/// 创建新的 .md 文件（文件必须不存在）。
#[tauri::command]
pub async fn knowledge_create_file(rel_path: String) -> Result<(), String> {
    // 验证文件名
    let file_name = std::path::Path::new(&rel_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效文件名".to_string())?
        .to_string();
    validate_md_filename(&file_name)?;

    let path = resolve_safe_path(&rel_path)?;
    if path.exists() {
        return Err(format!("文件已存在: {rel_path}"));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {e}"))?;
    }
    write_text_file(&path, "").map_err(|e| format!("创建文件失败: {e}"))
}

/// 创建文件夹（含父级）。
#[tauri::command]
pub async fn knowledge_create_dir(rel_path: String) -> Result<(), String> {
    let dir_name = std::path::Path::new(&rel_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效目录名".to_string())?
        .to_string();
    validate_item_name(&dir_name)?;

    let path = resolve_safe_path(&rel_path)?;
    if path.exists() {
        return Err(format!("目录已存在: {rel_path}"));
    }
    std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {e}"))
}

/// 重命名文件或文件夹，返回新的 rel_path。
#[tauri::command]
pub async fn knowledge_rename(rel_path: String, new_name: String) -> Result<String, String> {
    // 验证新名称
    let is_file = rel_path.ends_with(".md")
        && !std::path::Path::new(&rel_path)
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with('.'))
            .unwrap_or(false);
    if is_file {
        validate_md_filename(&new_name)?;
    } else {
        validate_item_name(&new_name)?;
    }

    let src = resolve_safe_path(&rel_path)?;
    if !src.exists() {
        return Err(format!("路径不存在: {rel_path}"));
    }

    let parent = src.parent().ok_or_else(|| "无效路径".to_string())?;
    let dst = parent.join(&new_name);

    // 确认目标也在安全范围内
    let canonical_base = get_knowledge_dir()
        .canonicalize()
        .map_err(|e| format!("无法解析知识库根目录: {e}"))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("无法解析父目录: {e}"))?;
    if !canonical_parent.starts_with(&canonical_base) {
        return Err("目标路径超出知识库范围".to_string());
    }

    if dst.exists() {
        return Err(format!("目标名称已存在: {new_name}"));
    }

    std::fs::rename(&src, &dst).map_err(|e| format!("重命名失败: {e}"))?;

    to_rel_path(&dst)
}

/// 删除单个文件或空目录。
#[tauri::command]
pub async fn knowledge_delete(rel_path: String) -> Result<(), String> {
    let path = resolve_safe_path(&rel_path)?;
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        std::fs::remove_dir(&path)
            .map_err(|e| format!("删除目录失败（目录非空时请使用 knowledge_delete_recursive）: {e}"))
    } else {
        std::fs::remove_file(&path).map_err(|e| format!("删除文件失败: {e}"))
    }
}

/// 递归删除目录及其所有内容。
#[tauri::command]
pub async fn knowledge_delete_recursive(rel_path: String) -> Result<(), String> {
    let path = resolve_safe_path(&rel_path)?;
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| format!("递归删除目录失败: {e}"))
    } else {
        std::fs::remove_file(&path).map_err(|e| format!("删除文件失败: {e}"))
    }
}

/// 返回知识库根目录的绝对路径（用于 UI 显示）。
#[tauri::command]
pub async fn knowledge_get_base_path() -> Result<String, String> {
    let base = get_knowledge_dir();
    std::fs::create_dir_all(&base).map_err(|e| format!("无法创建知识库目录: {e}"))?;
    Ok(base.to_string_lossy().to_string())
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeImportResult {
    pub imported: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
}

/// 弹出文件选择框，导入一个或多个 .md 文件到指定目录（dest_rel_path="" 表示根目录）。
#[tauri::command]
pub async fn knowledge_import_files<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    dest_rel_path: String,
) -> Result<Option<KnowledgeImportResult>, String> {
    let dialog = app.dialog();
    let picked = dialog
        .file()
        .add_filter("Markdown", &["md"])
        .blocking_pick_files();

    let files = match picked {
        Some(f) => f,
        None => return Ok(None), // 用户取消
    };

    let dest_dir = resolve_safe_path(&dest_rel_path)?;
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("创建目标目录失败: {e}"))?;

    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut errors: Vec<String> = Vec::new();

    for file_path in files {
        let src = std::path::PathBuf::from(file_path.to_string());
        let file_name = match src.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => { errors.push(format!("无法获取文件名: {}", src.display())); continue; }
        };
        if !file_name.ends_with(".md") {
            skipped += 1;
            continue;
        }
        let dst = dest_dir.join(&file_name);
        if dst.exists() {
            // 文件已存在：加数字后缀避免覆盖
            let stem = file_name.trim_end_matches(".md");
            let mut n = 1u32;
            loop {
                let candidate = dest_dir.join(format!("{stem}_{n}.md"));
                if !candidate.exists() {
                    let content = std::fs::read_to_string(&src)
                        .map_err(|e| format!("读取 {file_name} 失败: {e}"))?;
                    write_text_file(&candidate, &content)
                        .map_err(|e| format!("写入失败: {e}"))?;
                    imported += 1;
                    break;
                }
                n += 1;
            }
        } else {
            let content = std::fs::read_to_string(&src)
                .map_err(|e| format!("读取 {file_name} 失败: {e}"))?;
            write_text_file(&dst, &content)
                .map_err(|e| format!("写入失败: {e}"))?;
            imported += 1;
        }
    }

    Ok(Some(KnowledgeImportResult { imported, skipped, errors }))
}

/// 弹出文件夹选择框，递归导入其中所有 .md 文件，保留目录结构。
#[tauri::command]
pub async fn knowledge_import_folder<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    dest_rel_path: String,
) -> Result<Option<KnowledgeImportResult>, String> {
    let dialog = app.dialog();
    let picked = dialog.file().blocking_pick_folder();

    let folder_path = match picked {
        Some(p) => std::path::PathBuf::from(p.to_string()),
        None => return Ok(None),
    };

    if !folder_path.is_dir() {
        return Err(format!("所选路径不是目录: {}", folder_path.display()));
    }

    let dest_dir = resolve_safe_path(&dest_rel_path)?;
    std::fs::create_dir_all(&dest_dir).map_err(|e| format!("创建目标目录失败: {e}"))?;

    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut errors: Vec<String> = Vec::new();

    import_dir_recursive(&folder_path, &dest_dir, &mut imported, &mut skipped, &mut errors);

    Ok(Some(KnowledgeImportResult { imported, skipped, errors }))
}

fn import_dir_recursive(
    src_dir: &std::path::Path,
    dst_dir: &std::path::Path,
    imported: &mut u32,
    skipped: &mut u32,
    errors: &mut Vec<String>,
) {
    let entries = match std::fs::read_dir(src_dir) {
        Ok(e) => e,
        Err(e) => { errors.push(format!("读取目录失败 {}: {e}", src_dir.display())); return; }
    };

    for entry in entries.flatten() {
        let src_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }

        if src_path.is_dir() {
            let sub_dst = dst_dir.join(&name);
            if let Err(e) = std::fs::create_dir_all(&sub_dst) {
                errors.push(format!("创建目录失败 {name}: {e}"));
                continue;
            }
            import_dir_recursive(&src_path, &sub_dst, imported, skipped, errors);
        } else if src_path.is_file() && name.ends_with(".md") {
            let dst_path = dst_dir.join(&name);
            let final_dst = if dst_path.exists() {
                let stem = name.trim_end_matches(".md");
                let mut n = 1u32;
                loop {
                    let c = dst_dir.join(format!("{stem}_{n}.md"));
                    if !c.exists() { break c; }
                    n += 1;
                }
            } else {
                dst_path
            };
            match std::fs::read_to_string(&src_path) {
                Ok(content) => {
                    match write_text_file(&final_dst, &content) {
                        Ok(_) => *imported += 1,
                        Err(e) => errors.push(format!("写入 {name} 失败: {e}")),
                    }
                }
                Err(e) => errors.push(format!("读取 {name} 失败: {e}")),
            }
        } else {
            *skipped += 1;
        }
    }
}

/// 弹出保存对话框，将 base64 编码的二进制内容写入用户选择的路径。
/// 用于导出 Word/PDF 等二进制文件。
/// 返回实际保存的路径，用户取消时返回 None。
#[tauri::command]
pub async fn knowledge_save_export_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    default_name: String,
    filter_name: String,
    filter_extensions: Vec<String>,
    base64_content: String,
) -> Result<Option<String>, String> {
    let dialog = app.dialog();
    let exts: Vec<&str> = filter_extensions.iter().map(|s| s.as_str()).collect();
    let result = dialog
        .file()
        .add_filter(&filter_name, &exts)
        .set_file_name(&default_name)
        .blocking_save_file();

    let save_path = match result {
        Some(p) => std::path::PathBuf::from(p.to_string()),
        None => return Ok(None),
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_content)
        .map_err(|e| format!("base64 解码失败: {e}"))?;

    if let Some(parent) = save_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    std::fs::write(&save_path, &bytes).map_err(|e| format!("写入文件失败: {e}"))?;

    Ok(Some(save_path.to_string_lossy().to_string()))
}

/// 将 HTML 内容写入临时文件并用系统默认浏览器打开（用于 PDF 打印导出）。
#[tauri::command]
pub async fn knowledge_open_html_for_print<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    html: String,
    file_stem: String,
) -> Result<(), String> {
    let temp_dir = get_home_dir().join(".hermes-web").join("temp");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {e}"))?;

    let file_name = format!("print_{file_stem}.html");
    let path = temp_dir.join(&file_name);
    std::fs::write(&path, html.as_bytes()).map_err(|e| format!("写入临时文件失败: {e}"))?;

    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<String>)
        .map_err(|e| format!("打开浏览器失败: {e}"))?;

    Ok(())
}
