# 智能体面板 (Agents Panel) 技术设计文档

## 1. 功能概述

在聊天页面标题栏新增一个「智能体」按钮（红框位置），点击后弹出 Popover 面板，展示从 Hermes API Server 获取的智能体列表。用户可以查看可用智能体，并选择其中一个作为当前会话的执行主体。

**API 端点**：`GET http://{host}:{port}/api/agents`
- host/port 复用现有的 `ApiServerConfig`（`getHermesApiServerConfig` 命令）

---

## 2. API 约定

### 2.1 获取智能体列表

```
GET /api/agents
Authorization: Bearer {key}   （key 非空时附带）

Response 200:
[
  {
    "id": "health-advisor",
    "name": "家庭健康顾问",
    "description": "帮助用户建立和管理健康档案",
    "model": "deepseek-v4-pro",
    "skills": ["bitsoul-health"],
    "created_at": 1717000000
  },
  ...
]
```

前端以此结构为准，字段均为可选（除 `id`），渲染时做安全降级。

---

## 3. 技术方案

### 3.1 整体架构

```
前端 UI (ChatPage 标题栏)
    └── AgentsButton (Popover 触发器)
            └── AgentsPanel (Popover 内容)
                    ├── 智能体列表 (useHermesAgents hook)
                    └── 选择智能体 → 写入 session.agentId

前端 API
    └── src/lib/api/agents.ts
            └── agentsApi.getAgents()
                    └── invoke("getHermesAgents")

后端 Rust (src-tauri/src/commands/chat.rs)
    └── getHermesAgents()
            └── GET /api/agents (reqwest, 5s timeout)
```

### 3.2 后端：新增 Tauri 命令

**文件**: `src-tauri/src/commands/chat.rs`

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HermesAgent {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub model: Option<String>,
    pub skills: Option<Vec<String>>,
}

#[tauri::command]
pub async fn getHermesAgents() -> Result<Vec<HermesAgent>, String> {
    let cfg = read_api_server_config();
    let url = format!("http://{}:{}/api/agents", cfg.host, cfg.port);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .no_proxy()
        .build()
        .map_err(|e| format!("build client failed: {e}"))?;

    let mut req = client.get(&url);
    if !cfg.key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", cfg.key));
    }

    let resp = req.send().await
        .map_err(|e| format!("request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<Vec<HermesAgent>>().await
        .map_err(|e| format!("parse failed: {e}"))
}
```

**注册到 mod.rs**：在 `generate_handler!` 列表中添加 `getHermesAgents`。

### 3.3 前端 API 封装

**新文件**: `src/lib/api/agents.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface HermesAgent {
  id: string;
  name?: string;
  description?: string;
  model?: string;
  skills?: string[];
}

export const agentsApi = {
  async getAgents(): Promise<HermesAgent[]> {
    return await invoke("getHermesAgents");
  },
};
```

### 3.4 前端 Hook

**新增到**: `src/hooks/useHermesChat.ts`

```typescript
export const chatKeys = {
  // ...existing keys...
  agents: ["hermesChat", "agents"] as const,
};

export function useHermesAgents(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.agents,
    queryFn: () => agentsApi.getAgents(),
    enabled,
    refetchInterval: 30_000,   // 30s 轮询，智能体列表变化不频繁
    staleTime: 20_000,
  });
}
```

### 3.5 UI 组件

#### AgentsButton（Popover 触发器）

**新文件**: `src/components/chat/AgentsButton.tsx`

```tsx
interface AgentsButtonProps {
  isOnline: boolean;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}
```

- 图标：`Bot` (lucide-react)
- 当有选中智能体时，按钮显示高亮（`text-primary`）
- Popover 宽 280px，列表项高度 ~56px

**面板内容**:
```
┌─────────────────────────────┐
│  智能体                  [x] │
├─────────────────────────────┤
│  ○ 默认 (由服务端决定)        │  ← 第一项，value = null
├─────────────────────────────┤
│  ● 家庭健康顾问               │
│    deepseek-v4-pro           │
├─────────────────────────────┤
│  ○ 股票分析师                 │
│    gpt-4o                    │
└─────────────────────────────┘
```

- 离线时显示空状态：「服务未连接」
- 加载中显示 Skeleton（2 行）
- 加载失败显示错误文案 + 重试按钮

#### 集成到 ChatPage 标题栏

在 `src/components/chat/ChatPage.tsx` 的标题栏区域（Skills 按钮左侧）插入 `<AgentsButton>`：

```tsx
// ChatPage.tsx 顶栏按钮区域
<AgentsButton
  isOnline={isOnline}
  selectedAgentId={selectedAgentId}
  onSelectAgent={setSelectedAgentId}
/>
```

### 3.6 会话状态扩展

新增 `selectedAgentId` 状态（`string | null`），当前仅在内存中保存（不持久化到 DB），切换会话时重置。

**传递到后端**（`startChatRun`）：

```typescript
// useChatStream.ts StreamOptions 扩展
interface StreamOptions {
  // ...existing...
  agentId?: string;  // 新增
}

// sendRun 内部
invoke<{ runId: string }>("startChatRun", {
  request: {
    input,
    model: model ?? null,
    sessionId: sessionId ?? null,
    agentId: agentId ?? null,  // 新增
  },
  onEvent,
})
```

**后端 `StartChatRunRequest` 扩展**（`chat.rs`）：

```rust
#[derive(Deserialize)]
pub struct StartChatRunRequest {
    pub input: String,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub agent_id: Option<String>,  // 新增
}
```

后端将 `agent_id` 透传到 POST `/v1/runs` 的请求体中（Hermes 服务端负责路由到对应 Agent）。

---

## 4. 数据流

```
用户点击 AgentsButton
    → Popover 展开
    → useHermesAgents(isOnline) 触发 (已缓存则直接显示)
    → 用户点击某个 Agent
    → setSelectedAgentId(agentId)
    → Popover 关闭

用户发送消息
    → doSendToAgent(text, files)
    → sendRun({ ..., agentId: selectedAgentId })
    → invoke("startChatRun", { request: { ..., agent_id } })
    → 后端 POST /v1/runs 携带 agent_id
    → 流式响应返回
```

---

## 5. 国际化

在三个 locale 文件中新增（`en.json` / `zh.json` / `ja.json`）：

```json
{
  "hermes": {
    "agents": {
      "button": "智能体",
      "title": "选择智能体",
      "default": "默认",
      "defaultHint": "(由服务端决定)",
      "empty": "暂无可用智能体",
      "offline": "服务未连接",
      "loadError": "加载失败",
      "retry": "重试"
    }
  }
}
```

---

## 6. 实现步骤

| 步骤 | 文件 | 工作量 |
|------|------|--------|
| 1. 后端命令 | `src-tauri/src/commands/chat.rs` + `mod.rs` | ~30 行 Rust |
| 2. 前端 API | `src/lib/api/agents.ts` (新建) | ~15 行 TS |
| 3. Hook | `src/hooks/useHermesChat.ts` (追加) | ~12 行 TS |
| 4. UI 组件 | `src/components/chat/AgentsButton.tsx` (新建) | ~90 行 TSX |
| 5. ChatPage 集成 | `src/components/chat/ChatPage.tsx` | ~20 行修改 |
| 6. 后端透传 agent_id | `chat.rs` startChatRun + `useChatStream.ts` | ~15 行修改 |
| 7. i18n | `en/zh/ja.json` | 各 ~8 行 |

**总计**: ~190 行新增，~35 行修改。

---

## 7. 技术决策说明

| 决策 | 理由 |
|------|------|
| 复用 `ApiServerConfig` 的 host/port | 智能体接口与聊天接口在同一 Hermes 服务，无需额外配置 |
| 30s refetchInterval | 智能体列表变化不频繁，避免频繁请求，失联时 5s timeout 快速失败 |
| agentId 不持久化到 DB | 当前会话级别的临时选择，切换会话时自然重置符合预期 |
| 后端做 HTTP 请求（非前端 fetch） | 与现有 getHermesChatModels 一致，避免 CSP 限制 |
| Popover 而非 Sheet/Modal | 体量小（列表选择），与 Skills 按钮、Server 配置按钮风格一致 |
