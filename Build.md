# Build Guide

## 环境要求

| 工具 | 版本 |
|------|------|
| Node.js | 22.12.0（见 `.node-version`）|
| pnpm | 8+ |
| Rust | 1.95+（见 `rust-toolchain.toml`）|
| Tauri CLI | 2.8+（`@tauri-apps/cli`）|

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 pnpm
npm install -g pnpm

# 安装前端依赖
pnpm install
```

---

## 开发模式

```bash
# 完整开发模式：同时启动 Vite 前端 + Tauri 后端（热重载）
pnpm dev

# 仅前端（无 Tauri 窗口，用于纯 UI 调试）
pnpm dev:renderer
```

---

## 生产打包

### macOS

```bash
# 标准生产包（.dmg + .app）
pnpm build

# Debug 版本（包含调试符号，体积更大）
pnpm tauri build --debug
```

输出目录：`src-tauri/target/release/bundle/macos/`

### Windows

```bash
pnpm build
```

输出目录：`src-tauri/target/release/bundle/msi/`（.msi 安装包）

### 指定平台配置

项目根目录下有平台专用配置，Tauri CLI 会自动合并：

- `src-tauri/tauri.conf.json` — 通用配置
- `src-tauri/tauri.macos.conf.json` — macOS 专用（本地化资源）
- `src-tauri/tauri.windows.conf.json` — Windows 专用（窗口标题栏）

---

## 提交前检查（CI）

```bash
# 前端：类型检查 + 格式检查 + 单元测试
pnpm typecheck && pnpm format:check && pnpm test:unit

# 后端：格式 + lint + 测试
cd src-tauri && cargo fmt --check && cargo clippy && cargo test
```

---

## Rust 后端单独操作

```bash
cd src-tauri

cargo fmt                              # 格式化
cargo clippy                           # lint
cargo test                             # 全部测试
cargo test test_name                   # 指定测试
cargo test --features test-hooks       # 启用测试专用 feature
```

---

## 常见问题

**打包时 Rust 编译报错**：确认 `rustup show` 中的 toolchain 版本 ≥ 1.95，运行 `rustup update` 更新。

**macOS 包无法打开（"无法验证开发者"）**：需要对 `.app` 进行代码签名，或用 `xattr -rd com.apple.quarantine` 手动清除隔离属性。

**Windows 打包需要额外依赖**：需安装 [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) 和 Visual Studio C++ Build Tools。
