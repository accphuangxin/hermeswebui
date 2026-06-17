# 导出会话为 Markdown 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在聊天页面提供两个导出入口（右键菜单 + 侧边栏按钮），将当前会话消息导出为 Markdown 文件。

**Architecture:** 纯前端实现，无需新增 Rust 命令。核心格式化逻辑抽为独立工具函数 `src/lib/chatExport.ts`，方便测试。触发导出时调用 `@tauri-apps/plugin-dialog` 的 `save()` 弹出文件保存对话框，再通过 Blob + `<a>` 写入文件（与 `TaskDetailPanel` 相同模式）。

**Tech Stack:** React 18, TypeScript, `@tauri-apps/plugin-dialog`, lucide-react, react-i18next, vitest

---

## 文件变更清单

| 操作 | 路径 | 说明 |
|------|------|------|
| 创建 | `src/lib/chatExport.ts` | 纯函数：将消息数组格式化为 Markdown 字符串 |
| 创建 | `tests/chatExport.test.ts` | 单元测试 |
| 修改 | `src/i18n/locales/zh.json` | 新增 `hermes.chat.exportSession` |
| 修改 | `src/i18n/locales/en.json` | 新增 `hermes.chat.exportSession` |
| 修改 | `src/i18n/locales/ja.json` | 新增 `hermes.chat.exportSession` |
| 修改 | `src/components/chat/ChatSidebar.tsx` | 新增 `onExportSession` prop + Download 图标 |
| 修改 | `src/components/chat/ChatPage.tsx` | 新增 `handleExportSession` + 右键菜单入口 + 传 prop |

---

## Task 1: 创建核心导出工具函数（TDD）

**Files:**
- Create: `src/lib/chatExport.ts`
- Create: `tests/chatExport.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/chatExport.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { formatSessionAsMarkdown } from "@/lib/chatExport";
import type { ChatMessage } from "@/types";

const baseMsg = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: "1",
  sessionId: "s1",
  role: "user",
  content: "hello",
  toolCalls: null,
  toolCallId: null,
  name: null,
  fileRefs: null,
  createdAt: 0,
  ...overrides,
});

describe("formatSessionAsMarkdown", () => {
  it("includes session title as h1", () => {
    const md = formatSessionAsMarkdown("My Chat", "gpt-4", []);
    expect(md).toContain("# My Chat");
  });

  it("uses fallback title when null", () => {
    const md = formatSessionAsMarkdown(null, "gpt-4", []);
    expect(md).toContain("# 未命名会话");
  });

  it("includes model name", () => {
    const md = formatSessionAsMarkdown("t", "gpt-5.5", []);
    expect(md).toContain("**模型**: gpt-5.5");
  });

  it("omits model line when model is empty", () => {
    const md = formatSessionAsMarkdown("t", "", []);
    expect(md).not.toContain("**模型**");
  });

  it("renders user message with 👤 heading", () => {
    const md = formatSessionAsMarkdown("t", "", [baseMsg({ role: "user", content: "hi" })]);
    expect(md).toContain("## 👤 用户");
    expect(md).toContain("hi");
  });

  it("renders assistant message with 🤖 heading", () => {
    const md = formatSessionAsMarkdown("t", "", [
      baseMsg({ role: "assistant", content: "world" }),
    ]);
    expect(md).toContain("## 🤖 助手");
    expect(md).toContain("world");
  });

  it("skips timeline messages", () => {
    const md = formatSessionAsMarkdown("t", "", [
      baseMsg({ role: "timeline", content: '{"tool":"bash"}' }),
    ]);
    expect(md).not.toContain("timeline");
    expect(md).not.toContain("bash");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test:unit -- tests/chatExport.test.ts
```

期望: FAIL，提示 `@/lib/chatExport` 模块不存在。

- [ ] **Step 3: 创建 `src/lib/chatExport.ts` 实现最小代码**

```typescript
import type { ChatMessage } from "@/types";

export function formatSessionAsMarkdown(
  title: string | null,
  model: string,
  messages: ChatMessage[],
): string {
  const sessionTitle = title ?? "未命名会话";
  const exportTime = new Date().toLocaleString("zh-CN");

  const lines: string[] = [`# ${sessionTitle}`, ""];
  lines.push(`**导出时间**: ${exportTime}`);
  if (model) lines.push(`**模型**: ${model}`);
  lines.push("", "---", "");

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push("## 👤 用户", "", msg.content, "", "---", "");
    } else if (msg.role === "assistant") {
      lines.push("## 🤖 助手", "", msg.content, "", "---", "");
    }
    // timeline and other roles are intentionally skipped
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test:unit -- tests/chatExport.test.ts
```

期望: 全部 PASS（注意 `exportTime` 使用 `new Date()` 所以"导出时间"行只测存在性，不测具体值，已在测试中正确处理）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/chatExport.ts tests/chatExport.test.ts
git commit -m "feat(chat): add formatSessionAsMarkdown utility with tests"
```

---

## Task 2: 新增 i18n 翻译键

**Files:**
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ja.json`

- [ ] **Step 1: 在 `zh.json` 的 `hermes.chat` 对象中 `rename` 之后添加新键**

找到位置（约第1793行 `"rename": "重命名",`），在其后插入：

```json
"exportSession": "导出为 Markdown",
"exportSuccess": "会话已导出",
"exportFailed": "导出失败",
```

- [ ] **Step 2: 在 `en.json` 同样位置添加**

找到 `"rename": "Rename",`，在其后插入：

```json
"exportSession": "Export as Markdown",
"exportSuccess": "Session exported",
"exportFailed": "Export failed",
```

- [ ] **Step 3: 在 `ja.json` 同样位置添加**

找到 `"rename": "名前を変更",`，在其后插入：

```json
"exportSession": "Markdownとして書き出す",
"exportSuccess": "セッションを書き出しました",
"exportFailed": "書き出しに失敗しました",
```

- [ ] **Step 4: 运行类型检查确认无误**

```bash
pnpm typecheck
```

期望: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/i18n/locales/zh.json src/i18n/locales/en.json src/i18n/locales/ja.json
git commit -m "feat(i18n): add exportSession translation keys"
```

---

## Task 3: ChatSidebar 添加导出按钮

**Files:**
- Modify: `src/components/chat/ChatSidebar.tsx`

- [ ] **Step 1: 在文件顶部 import 中添加 `Download` 图标**

找到第4行：
```typescript
import { Plus, Trash2, MessageSquare, Pencil } from "lucide-react";
```
改为：
```typescript
import { Plus, Trash2, MessageSquare, Pencil, Download } from "lucide-react";
```

- [ ] **Step 2: 在 `ChatSidebarProps` 接口中新增 prop**

找到：
```typescript
interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession?: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  isLocked?: boolean;
}
```
改为：
```typescript
interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession?: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onExportSession?: (id: string) => void;
  isLocked?: boolean;
}
```

- [ ] **Step 3: 解构新 prop 并在会话项图标区添加 Download 按钮**

找到函数签名解构处：
```typescript
export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  isLocked,
}: ChatSidebarProps) {
```
改为：
```typescript
export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onExportSession,
  isLocked,
}: ChatSidebarProps) {
```

然后找到 hover 图标区（约第109-130行），在 Pencil 按钮和 Trash2 按钮之间插入 Download 按钮：

```typescript
{editingId !== s.id && (
  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
    <button
      onClick={(e) => {
        e.stopPropagation();
        startRename(s);
      }}
      className="p-0.5 hover:text-foreground"
      title={t("hermes.chat.rename")}
    >
      <Pencil className="w-3 h-3" />
    </button>
    {onExportSession && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExportSession(s.id);
        }}
        className="p-0.5 hover:text-foreground"
        title={t("hermes.chat.exportSession", { defaultValue: "导出为 Markdown" })}
      >
        <Download className="w-3 h-3" />
      </button>
    )}
    <button
      onClick={(e) => {
        e.stopPropagation();
        setDeletingId(s.id);
      }}
      className="p-0.5 hover:text-destructive"
      title={t("hermes.chat.deleteSession")}
    >
      <Trash2 className="w-3 h-3" />
    </button>
  </div>
)}
```

- [ ] **Step 4: 类型检查**

```bash
pnpm typecheck
```

期望: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/ChatSidebar.tsx
git commit -m "feat(chat): add export button to sidebar session items"
```

---

## Task 4: ChatPage 实现导出逻辑并接入两个入口

**Files:**
- Modify: `src/components/chat/ChatPage.tsx`

- [ ] **Step 1: 添加 import**

找到顶部 import 区域，在现有 lucide import 之后添加：

找到：
```typescript
import { MessageSquare, Clock, Trash2, ChevronUp, ChevronDown } from "lucide-react";
```
改为：
```typescript
import { MessageSquare, Clock, Trash2, ChevronUp, ChevronDown, Download } from "lucide-react";
```

在 `import { chatApi }` 那行附近添加 chatExport import：

找到：
```typescript
import { chatApi } from "@/lib/api/chat";
```
改为：
```typescript
import { chatApi } from "@/lib/api/chat";
import { formatSessionAsMarkdown } from "@/lib/chatExport";
```

在 `@tauri-apps/plugin-dialog` 相关 import 处（此文件目前未导入），在文件顶部添加：

找到：
```typescript
import { compressContext } from "@/lib/contextCompression";
```
改为：
```typescript
import { save } from "@tauri-apps/plugin-dialog";
import { compressContext } from "@/lib/contextCompression";
```

- [ ] **Step 2: 实现 `handleExportSession` 函数**

在 `handleClearMessages` 函数之后（约第621行之后）插入：

```typescript
const handleExportSession = useCallback(
  async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    const sessionMessages = sessionId === activeSessionId ? messages : [];
    const modelName = (session?.model ?? selectedModel ?? "")
      .replace(/^custom_[^:]+:/, "")
      .replace("__default__", "");

    const content = formatSessionAsMarkdown(
      session?.title ?? null,
      modelName,
      sessionMessages,
    );

    const title = session?.title || t("hermes.chat.untitled", { defaultValue: "未命名聊天" });
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const defaultFilename = `${title}_${ts}.md`;

    try {
      const filePath = await save({
        defaultPath: defaultFilename,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!filePath) return;

      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() || defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("hermes.chat.exportSuccess", { defaultValue: "会话已导出" }));
    } catch {
      toast.error(t("hermes.chat.exportFailed", { defaultValue: "导出失败" }));
    }
  },
  [sessions, activeSessionId, messages, selectedModel, t],
);
```

- [ ] **Step 3: 将 `onExportSession` prop 传给 `ChatSidebar`**

找到 `<ChatSidebar` 组件使用处（约第707行），在现有 props 末尾添加：

```typescript
<ChatSidebar
  sessions={sessions}
  activeSessionId={activeSessionId}
  onSelectSession={setActiveSessionId}
  onNewSession={handleNewSession}
  isLocked={isStreaming || isWaiting || isSending}
  onDeleteSession={handleDeleteSession}
  onRenameSession={handleRenameSession}
  onExportSession={handleExportSession}
/>
```

- [ ] **Step 4: 在右键菜单中添加"导出"入口**

找到右键菜单 `areaMenu` 的渲染部分（约第1032行），在现有的"清除所有消息"按钮之前插入导出按钮：

```typescript
{areaMenu && (
  <div
    ref={areaMenuRef}
    className="fixed z-50 min-w-[160px] rounded-md border bg-popover shadow-md py-1 text-sm"
    style={{ left: areaMenu.x, top: areaMenu.y }}
  >
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left"
      onClick={() => {
        if (activeSessionId) void handleExportSession(activeSessionId);
        setAreaMenu(null);
      }}
      disabled={!activeSessionId || messages.length === 0}
    >
      <Download className="w-3.5 h-3.5" />
      {t("hermes.chat.exportSession", { defaultValue: "导出为 Markdown" })}
    </button>
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left text-destructive"
      onClick={() => {
        void handleClearMessages();
        setAreaMenu(null);
      }}
      disabled={!activeSessionId || messages.length === 0}
    >
      <Trash2 className="w-3.5 h-3.5" />
      {t("hermes.chat.clearMessages", { defaultValue: "清除所有消息" })}
    </button>
  </div>
)}
```

- [ ] **Step 5: 运行类型检查**

```bash
pnpm typecheck
```

期望: 无错误。

- [ ] **Step 6: 运行全量单元测试**

```bash
pnpm test:unit
```

期望: 全部 PASS，包括 `tests/chatExport.test.ts`。

- [ ] **Step 7: 提交**

```bash
git add src/components/chat/ChatPage.tsx
git commit -m "feat(chat): add export session to markdown via context menu and sidebar"
```
