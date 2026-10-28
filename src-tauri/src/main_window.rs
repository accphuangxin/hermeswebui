use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use tauri::webview::DownloadEvent;
use tauri::{Emitter, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN_WINDOW_LABEL: &str = "main";

/// 注入到所有 frame（含跨域 iframe）的下载拦截脚本。
///
/// 智能采购等内嵌页面的导出走 SheetJS/FileSaver：先 `createObjectURL(blob)`
/// 再 `<a download>` 点击。WKWebView 对这类 blob 下载拿不到文件名（会变成
/// `Unknown`），因此这里截获 Blob 本体和建议文件名，通过 postMessage 交给
/// 顶层页面，再调用 Rust 命令弹出系统“另存为”对话框。
const DOWNLOAD_INTERCEPT_SCRIPT: &str = r#"
(function () {
  try {
    if (window.top === window) return;
  } catch (e) {
    return;
  }
  if (window.__HERMES_DL_HOOK__) return;
  window.__HERMES_DL_HOOK__ = true;

  // SheetJS/FileSaver 把 WKWebView 判定为“嵌入式 Safari”（Macintosh + AppleWebKit
  // 但无 Safari 标记），因此放弃 <a download>，改用 open("","_blank") +
  // data:attachment/file;base64 跳转下载——文件名会丢成 "Unknown"。
  // 补上 Safari 标记让它回到标准的 blob + <a download> 路径。
  try {
    var ua = navigator.userAgent;
    if (ua.indexOf("Safari/") === -1) {
      var safariUa = ua + " Safari/605.1.15";
      var uaGetter = function () { return safariUa; };
      try {
        Object.defineProperty(navigator, "userAgent", { configurable: true, get: uaGetter });
      } catch (e) {
        Object.defineProperty(Navigator.prototype, "userAgent", {
          configurable: true,
          get: uaGetter,
        });
      }
    }
  } catch (e) {}

  var blobUrls = Object.create(null);

  var origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    var url = origCreateObjectURL.call(URL, obj);
    try {
      if (obj instanceof Blob) blobUrls[url] = obj;
    } catch (e) {}
    return url;
  };

  function sniffExtension(bytes, mime) {
    if (bytes.length >= 4) {
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) return ".xlsx";
      if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return ".pdf";
      if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return ".xls";
    }
    if (mime && mime.indexOf("csv") !== -1) return ".csv";
    if (mime && mime.indexOf("json") !== -1) return ".json";
    if (mime && mime.indexOf("text/plain") !== -1) return ".txt";
    return "";
  }

  function sendBlob(blob, name) {
    try {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var buffer = reader.result;
          var bytes = new Uint8Array(buffer);
          var fileName = String(name || "").replace(/[\\/:*?"<>|\r\n]/g, "_").trim() || "download";
          if (!/\.[A-Za-z0-9]{1,8}$/.test(fileName)) {
            fileName += sniffExtension(bytes, blob.type);
          }
          window.top.postMessage(
            { type: "__hermes_download__", filename: fileName, bytes: buffer },
            "*",
            [buffer]
          );
        } catch (e) {}
      };
      reader.readAsArrayBuffer(blob);
    } catch (e) {}
  }

  function blobFor(href) {
    return href && href.indexOf("blob:") === 0 ? blobUrls[href] : null;
  }

  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      var blob = blobFor(this.href);
      if (blob) {
        sendBlob(blob, this.getAttribute("download") || this.download);
        return;
      }
    } catch (e) {}
    return origClick.apply(this, arguments);
  };

  // FileSaver 的标准分支不调用 a.click()，而是对（未挂到 DOM 的）anchor
  // dispatch 一个 click 事件，所以这里还需要拦截 dispatchEvent。
  var origDispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (event) {
    try {
      if (event && event.type === "click") {
        var blob = blobFor(this.href);
        if (blob) {
          sendBlob(blob, this.getAttribute("download") || this.download);
          return false;
        }
      }
    } catch (e) {}
    return origDispatch.apply(this, arguments);
  };

  document.addEventListener("click", function (event) {
    try {
      var el = event.target;
      while (el && el.tagName !== "A") el = el.parentNode;
      var blob = el ? blobFor(el.href) : null;
      if (blob) {
        event.preventDefault();
        event.stopImmediatePropagation();
        sendBlob(blob, el.getAttribute("download") || el.download);
      }
    } catch (e) {}
  }, true);
})();
"#;

#[derive(Clone, serde::Serialize)]
pub struct DownloadFinishedPayload {
    pub url: String,
    pub path: Option<String>,
    pub success: bool,
}

/// wry 在 macOS 的完成回调里固定传 `None` 作为路径（download_did_finish），
/// 所以在“开始下载”时把生成的目标路径按 URL 记下来，完成时再取回。
fn pending_download_paths() -> &'static Mutex<HashMap<String, Vec<PathBuf>>> {
    static PATHS: OnceLock<Mutex<HashMap<String, Vec<PathBuf>>>> = OnceLock::new();
    PATHS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_download_path(url: &str, path: PathBuf) {
    pending_download_paths()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .entry(url.to_string())
        .or_default()
        .push(path);
}

fn take_download_path(url: &str) -> Option<PathBuf> {
    pending_download_paths()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get_mut(url)
        .and_then(|paths| paths.pop())
}

/// 创建主窗口。
///
/// 主窗口由代码创建而非 `tauri.conf.json` 的 `app.windows`，因为只有
/// builder 能挂载 `on_download`：WKWebView 在未注册下载处理器时会直接
/// 取消“下载”类导航，导致内嵌页面（智能采购）导出附件无任何反应。
pub fn create_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    let mut builder = WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::default())
        .title("")
        .inner_size(1000.0, 650.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .resizable(true)
        .visible(false)
        .initialization_script_for_all_frames(DOWNLOAD_INTERCEPT_SCRIPT);

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
    }

    builder
        .on_download(|webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    // wry 已按建议文件名在下载目录下生成不冲突的路径，直接沿用
                    log::info!("下载开始: {url} -> {}", destination.display());
                    remember_download_path(url.as_str(), destination.clone());
                }
                DownloadEvent::Finished { url, path, success } => {
                    // 优先用平台回调给出的路径；macOS 上为 None，回退到开始下载时记录的路径
                    let path = path
                        .map(|p| p.to_path_buf())
                        .or_else(|| take_download_path(url.as_str()));
                    let path = path.map(|p| p.to_string_lossy().to_string());
                    log::info!("下载结束: {url}，成功={success}，路径={path:?}");
                    let _ = webview.emit(
                        "download-finished",
                        DownloadFinishedPayload {
                            url: url.to_string(),
                            path,
                            success,
                        },
                    );
                }
                _ => {}
            }
            true
        })
        .build()
        .map_err(|e| format!("创建主窗口失败: {e}"))
}
