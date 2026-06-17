# 导出会话为 Markdown

**日期**: 2026-06-17  
**状态**: 已批准

## 背景

用户需要将当前聊天会话的所有消息导出为 Markdown 文件，方便存档或分享。

## 功能描述

在聊天页面提供两个触发入口：

1. **右键菜单**：在聊天区域右键菜单中新增"导出为 Markdown"选项（与现有"清除所有消息"并列）。
2. **侧边栏按钮**：在每个会话项 hover 时出现的图标区域，新增 `Download` 图标，位于重命名（Pencil）和删除（Trash2）图标之间。

## 导出格式

```markdown
# 会话标题

**导出时间**: YYYY-MM-DD HH:mm
**模型**: model-name

---

## 👤 用户

用户消息内容

---

## 🤖 助手

助手回复内容

---
```

- 仅导出已持久化到 DB 的消息（`role` 为 `user` 或 `assistant`）
- 排除 `role === "timeline"` 的工具调用元数据行
- 不含流式进行中的内容

## 实现方案

### 纯前端，无新 Rust 命令

复用已有的 `@tauri-apps/plugin-dialog` 的 `save()` 弹出保存对话框（与 `TaskDetailPanel` 中相同模式）。文件写入通过 Blob + `<a>` 下载触发（Tauri 中等效于写文件）。

### 改动文件

**`src/components/chat/ChatPage.tsx`**
- 新增 `handleExportSession(sessionId: string)` 函数：
  - 从 `sessions` 中查找会话标题
  - 将 `messages`（已过滤掉 timeline）格式化为 Markdown
  - 调用 `save()` 弹出文件保存对话框，默认文件名 `{title}_{timestamp}.md`
  - 写入文件，toast 提示成功/失败
- 右键菜单 (`areaMenu`) 追加"导出为 Markdown"按钮，调用 `handleExportSession(activeSessionId)`

**`src/components/chat/ChatSidebar.tsx`**
- 新增 `onExportSession?: (id: string) => void` prop
- 每个会话项 hover 图标区追加 `Download` 图标按钮，触发 `onExportSession(s.id)`
- `ChatPage` 传入 `onExportSession={handleExportSession}`

**`src/i18n/locales/{en,zh,ja}.json`**
- 各加一条 `hermes.chat.exportSession` key

## 边界情况

- 无消息时导出按钮不可点击（与"清除所有消息"保持一致）
- 用户取消保存对话框时静默退出，不报错
- 会话标题为空时使用 fallback "未命名会话"
