# Windows 打包说明

本项目的 Windows 安装包**必须在 Windows 机器上构建**。Tauri 不支持从 macOS/Linux
交叉编译 Windows 安装包（需要 MSVC 工具链、Windows SDK，以及 Windows 专用的
WiX / NSIS 打包器）。

---

## 一、环境准备（一次性）

### 必需

| 依赖 | 版本 / 说明 |
|---|---|
| **Windows 10/11 x64** | arm64 也能构建，命令里加 `--target aarch64-pc-windows-msvc` 即可 |
| **Rust** | 1.95+（由 `rust-toolchain.toml` 自动锁定，`rustup` 会自己装） |
| **Visual Studio C++ Build Tools** | 勾选「使用 C++ 的桌面开发」工作负载，装 MSVC v143 + Windows 10/11 SDK |
| **Node.js** | 22.x（见 `.node-version`） |
| **pnpm** | 12.x（本仓库的 `pnpm-workspace.yaml` 使用 `allowBuilds` 语法） |
| **WebView2** | Windows 11 自带；Windows 10 需要装 [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/) |

### 检查是否装好

```powershell
rustup show                 # 应显示 1.95 channel
rustc -V
node -v                     # v22.x
pnpm -v                     # 12.x
```

> **pnpm 版本很重要**：`pnpm-workspace.yaml` 里的 `allowBuilds` 需要 pnpm 12。
> 用 pnpm 9/10 不会报错，但构建脚本白名单不会生效（见文末「已知问题」）。

---

## 二、打包

```powershell
# 1) 安装依赖
pnpm install --frozen-lockfile

# 2) 打包（同时产出 MSI 与 NSIS 安装包）
pnpm tauri build --bundles msi,nsis
```

产物位置：

```
src-tauri\target\release\bundle\msi\111 Hermes_3.14.1_x64_en-US.msi
src-tauri\target\release\bundle\nsis\111 Hermes_3.14.1_x64-setup.exe
```

两者选一个分发即可：

| 格式 | 适用场景 |
|---|---|
| `.msi` | 企业环境 / 组策略分发 / 需要静默安装（`msiexec /i xxx.msi /qn`） |
| `.exe`（NSIS） | 普通用户双击安装，体积更小 |

### 只出一个格式

```powershell
pnpm tauri build --bundles nsis   # 只要 exe
pnpm tauri build --bundles msi    # 只要 msi
```

### Debug 构建（带符号，便于排查）

```powershell
pnpm tauri build --debug
```

---

## 三、打包前建议先跑一遍检查

```powershell
pnpm typecheck
pnpm format:check
pnpm test:unit

cd src-tauri
cargo fmt --check
cargo clippy
cargo test --lib
```

> `cargo test`（不带 `--lib`）在 Windows 上会编译 `src-tauri\tests\*.rs`，
> 其中部分文件引用了 `cc_switch_lib` crate，这个 crate 在当前的
> `Cargo.toml` 里不存在，会直接编译失败。这是历史遗留问题，与打包无关。
> 用 `cargo test --lib` 即可。

---

## 四、首次运行需要配置的内容

打包出来的应用**不包含任何 API Key**（仓库是公开的）。安装后需要手动填一次：

**设置 → 通用 → 语音输入**

| 字段 | 值 |
|---|---|
| 开关 | 开 |
| API 地址 | `http://134.175.238.232:8090`（默认已填） |
| 转写模型 | `Qwen/Qwen3-ASR-1.7B-hf`（默认已填） |
| API Key | 需要手动填写 |

麦克风权限：Windows 10/11 首次录音时会弹系统授权框（设置 → 隐私 → 麦克风）。

---

## 五、签名（可选）

不签名也能安装，但 Windows SmartScreen 会提示「未知发布者」，
用户需要点「更多信息 → 仍要运行」。

要消除提示，需要有代码签名证书（OV/EV），然后在打包时设置环境变量：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = ""       # 仅自动更新需要
# 代码签名用证书指纹（需提前导入证书）
$env:CSC_FINGERPRINT = "你的证书指纹"
pnpm tauri build --bundles msi,nsis
```

或直接在 `src-tauri/tauri.conf.json` 的 `bundle.windows` 下配置
`certificateThumbprint` / `digestAlgorithm` / `timestampUrl`。

> **当前状态**：项目未配置任何签名，打出来的包在陌生机器上会有 SmartScreen 提示。

---

## 六、CI 构建（不用本地装环境）

仓库里已有 GitHub Actions 工作流，可以在 GitHub 的 Windows runner 上直接产出安装包：

- `.github/workflows/build-windows.yml` —— 功能最全（含 WiX 失败诊断），**推荐用这个**
- `.github/workflows/main.yml` —— 同名旧副本，配置较简单

触发方式：

1. GitHub → Actions → 左侧选 **Build Windows Installer** → **Run workflow**
2. 或推一个 tag：`git tag v3.14.1 && git push origin v3.14.1`

产物在运行详情页底部的 **Artifacts** 区，下载 `Hermes-web-windows-msi` /
`Hermes-web-windows-nsis` 两个 zip。

> CI 里用的是 pnpm 9，与本地 pnpm 12 的差异见文末。

---

## 七、已知问题

### 1. `allowBuilds` 只在 pnpm 12 生效

`pnpm-workspace.yaml` 里用 `allowBuilds` 声明允许执行 postinstall 的包：

```yaml
allowBuilds:
  '@tailwindcss/oxide': true
  esbuild: true
  core-js: false
  msw: false
```

- **pnpm 12**：映射语法有效，`true` 执行、`false` 跳过、未列出的会报
  `ERR_PNPM_IGNORED_BUILDS`
- **pnpm 9 / 10**：整个 `allowBuilds` 被忽略（不报错）

对当前项目**没有实际影响**：`esbuild` 与 `@tailwindcss/oxide` 都有预编译的
平台二进制包，安装时直接下载，不依赖 postinstall。已在干净 clone 上用
pnpm 9 验证过 `pnpm build:renderer` 能正常构建。

### 2. 主窗口由代码创建

`src-tauri/tauri.conf.json` 的 `app.windows` 是空数组，主窗口在
`src-tauri/src/main_window.rs` 里用 `WebviewWindowBuilder` 创建（为了挂载
`on_download` 处理器）。因此 `src-tauri/tauri.windows.conf.json` 也必须是
空数组 —— 否则 Tauri 会先按配置创建一个 `main` 窗口，代码里再建同 label 的
第二个窗口，报 `a window with label 'main' already exists`，应用启动即失败。

如果你要改 Windows 的窗口标题 / 尺寸，请改 `main_window.rs`。

### 3. Windows 上没有 `titleBarStyle: Overlay`

`main_window.rs` 里 macOS 专属的 `TitleBarStyle::Overlay` 已用
`#[cfg(target_os = "macos")]` 包住，Windows 使用系统默认标题栏，无需改动。
