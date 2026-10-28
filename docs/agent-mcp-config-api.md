# Agent MCP 配置接口 — 前端对接文档

> 面向：Hermes Web 前端实现者
> 后端：`hermes_agent_manager`（ControlServer，aiohttp）
> 状态：后端已实现并有单测覆盖；前端待接入

## 1. 功能概述

Agent（= Hermes profile）除模型外，还可以配置 **MCP servers**。本接口让前端在「智能体」页面里对某个 agent 增删改查它的 `mcp_servers`、测试连通性并发现工具、启停单个 server、配置启用的工具集。

后端把这些配置写进该 profile 的 `~/.hermes/profiles/{name}/config.yaml` 的 `mcp_servers` 块——和 CLI `hermes mcp ...`、Dashboard 写的是同一份配置。

**基址**：与现有 agent 接口一致，`http://{host}:8640`（`host` 取现有 `read_api_server_config().host`）。

**鉴权**：默认不鉴权（manager 的 `api_key` 默认为空）。仅当后端以 `AGENT_MANAGER_KEY=xxx` 启动时才需附带 `Authorization: Bearer xxx`。前端可按现有约定的「key 非空时附带」处理。

**agent id**：列表接口返回的 `agent.id`（形如 `hermes-profile-{name}`）**原样**用作路径参数；不要自己拼。仅 `hermes-profile-*` 类型的 agent 支持 MCP 配置，DB 托管的其它 agent 会返回 400。

---

## 2. API 约定

统一前缀：`/v1/agents/{id}/mcp`

### 2.1 列出所有 MCP server

```
GET /v1/agents/{id}/mcp

Response 200:
{
  "servers": [
    {
      "name": "ink",
      "transport": "http",          // "http" | "stdio" | "unknown"
      "url": "https://mcp.example.com/mcp",   // 有 url 时
      "command": null,              // stdio 时是命令
      "args": [],
      "env": { "API_TOKEN": "supe...3456" },  // ⚠️ 已脱敏，不可回填保存
      "auth": "header",             // "oauth" | "header" | null
      "enabled": true,
      "tools": { "include": ["a","b"] } | { "exclude": ["c"] } | null   // null = 全部
    }
  ]
}
```

> ⚠️ **`env` 的值是脱敏后的**（形如 `supe...3456`）。读到之后**只能用于展示**，回写时必须让用户重新输入，绝不能把脱敏值当原值提交。

### 2.2 新增 / 覆盖单个 server

```
POST /v1/agents/{id}/mcp
Content-Type: application/json

// stdio 示例
{ "name": "github", "command": "npx", "args": ["-y","@modelcontextprotocol/server-github"],
  "env": { "GITHUB_TOKEN": "ghp_xxx" } }

// http 示例
{ "name": "ink", "url": "https://mcp.ml.ink/mcp", "auth": "oauth" }

Response 201:
{ "name": "github", "transport": "stdio", ..., "restart_required": true }
```

请求体字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | **必填**，server 名（同一 agent 内唯一） |
| `url` | string | HTTP/SSE 传输；与 `command` **二选一** |
| `command` | string | stdio 传输；与 `url` 二选一 |
| `args` | string[] | 仅 stdio |
| `env` | object | 仅 stdio，`KEY: VALUE` |
| `headers` | object | 仅 http，可放 `${VAR}` 模板 |
| `auth` | string | `"oauth"` 时写 `auth: oauth`（OAuth 流程本身由 CLI/Dashboard 完成） |
| `enabled` | bool | 省略则默认启用 |
| `tools` | object | `{"include":[...]}` 或 `{"exclude":[...]}` |
| `connect_timeout` | number | 可选 |

**错误**：`url` 与 `command` 同时给/都不给 → 400；命中安全校验（可疑 shell 命令）→ 400，body 为 `{"error": "..."}`。

### 2.3 整体替换

```
PUT /v1/agents/{id}/mcp
{ "servers": { "ink": { "url": "https://..." }, "github": { "command": "npx" } } }

Response 200: { "ok": true, "restart_required": true }
```

用于「mcp.json 编辑器」式的整块保存。**任意一条不合法则整块拒绝**（不会部分写入）。传空对象 `{"servers":{}}` 表示清空。

### 2.4 删除

```
DELETE /v1/agents/{id}/mcp/{name}
Response 200: { "ok": true, "name": "github", "restart_required": true }
Response 404: { "error": "Server 'github' not found" }
```

### 2.5 测试连通性 + 工具发现

```
POST /v1/agents/{id}/mcp/{name}/test

Response 200（成功）:
{
  "ok": true,
  "tools": [ { "name": "search", "description": "...", "schema_chars": 812 } ],
  "prompts": 0,
  "resources": 2
}

Response 200（连接失败，注意仍是 200）:
{ "ok": false, "error": "……已脱敏的错误信息", "tools": [] }
```

连接失败用 `ok:false` 表达，**不是** HTTP 错误码；仅「server 不存在」返回 404。

### 2.6 启停

```
PUT /v1/agents/{id}/mcp/{name}/enabled
{ "enabled": false }

Response 200: { "ok": true, "name": "github", "enabled": false, "restart_required": true }
404: server 不存在
```

### 2.7 配置启用哪些工具

```
PUT /v1/agents/{id}/mcp/{name}/tools

{ "include": ["a","b"] }   // 白名单；"include": [] 表示「全部屏蔽」（合法，非「无过滤」）
{ "exclude": ["c*"] }      // 黑名单，支持 glob
{ }                        // 空对象 = 清空过滤，注册全部工具

Response 200: { "ok": true, "name": "github", "restart_required": true }
```

`include` 与 `exclude` **不能同时给** → 400。

---

## 3. 生效语义（重要）

MCP 改动写入的是 profile 的 `config.yaml`，**在下一个 session / gateway 启动时才生效**。

因此所有变更类接口的响应都带 `restart_required: true`。前端应：

- 保存成功后提示「配置已保存，重启该 Agent 后生效」；或
- 直接调用已有的 `agentsApi.restartAgent(id)`（`POST /v1/agents/{id}/restart`）让改动立即生效。
- **test** 与 **list** 不需要重启。

> 注意与「模型配置」的差异：模型编辑（`updateAgent`）后端会自动重启 gateway；MCP 编辑**不会**，这是有意为之（避免每次勾选工具都重启一轮进程）。

---

## 4. 技术方案（本仓库接入方式）

现有 agent 接口全部走 **Tauri command**（前端 `invoke`，Rust 侧用 `reqwest` 打 ControlServer），MCP 接口照此扩展三层即可。

```
前端 UI (HermesAgentsPage.tsx 的 Agent 详情/设置区)
    └── 新增 MCP 配置面板
            └── src/lib/api/agents.ts  agentsApi.*Mcp*
                    └── invoke("...")
                            └── 后端 Rust：src-tauri/src/commands/chat.rs
                                    └── reqwest → http://{host}:8640/v1/agents/{id}/mcp...
```

### 4.1 后端：新增 Tauri 命令（`src-tauri/src/commands/chat.rs`）

沿用 `getHermesAgents()` 的写法（`reqwest` + `no_proxy` + `read_api_server_config().host` + 端口 8640）。建议抽一个 helper：

```rust
async fn control_request(
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))   // test 探测可能较慢
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to build client: {e}"))?;
    let host = read_api_server_config().host;
    let url = format!("http://{host}:8640{path}");
    let mut req = client.request(method, url);
    if let Some(b) = body { req = req.json(&b); }
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("HTTP {status}: {text}"));
    }
    if text.is_empty() { return Ok(serde_json::json!({})); }
    serde_json::from_str(&text).map_err(|e| format!("parse failed: {e}"))
}
```

再基于它实现 7 个命令（`pub async fn` + `#[tauri::command]`）：

| 命令 | 方法 + 路径 |
|---|---|
| `getAgentMcpServers(agent_id)` | `GET /v1/agents/{agent_id}/mcp` |
| `addAgentMcpServer(agent_id, server)` | `POST /v1/agents/{agent_id}/mcp` |
| `replaceAgentMcpServers(agent_id, servers)` | `PUT /v1/agents/{agent_id}/mcp` |
| `deleteAgentMcpServer(agent_id, name)` | `DELETE /v1/agents/{agent_id}/mcp/{name}` |
| `testAgentMcpServer(agent_id, name)` | `POST /v1/agents/{agent_id}/mcp/{name}/test` |
| `setAgentMcpServerEnabled(agent_id, name, enabled)` | `PUT .../{name}/enabled` |
| `setAgentMcpServerTools(agent_id, name, include, exclude)` | `PUT .../{name}/tools` |

> ⚠️ **路径要 URL 编码**：`agent_id`（`hermes-profile-{name}`）与 `{name}` 拼进 URL 前请用 `urlencoding::encode` 之类的处理；server 名可能含特殊字符。
> ⚠️ 新命令必须在 `src-tauri/src/lib.rs` 的 `generate_handler![...]`（约 1324 行附近，紧挨现有 `getHermesAgents` 等）里注册，否则 `invoke` 会报 unknown command。

### 4.2 前端：`src/lib/api/agents.ts`

```ts
export interface AgentMcpServer {
  name: string;
  transport: "http" | "stdio" | "unknown";
  url?: string | null;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;       // 读回来是脱敏值，勿回写
  auth?: "oauth" | "header" | null;
  enabled: boolean;
  tools?: { include?: string[]; exclude?: string[] } | null;
}

export interface AgentMcpTool { name: string; description?: string; schema_chars?: number }
export interface AgentMcpTestResult {
  ok: boolean;
  error?: string;
  tools: AgentMcpTool[];
  prompts?: number;
  resources?: number;
}

export interface AddAgentMcpServerInput {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  auth?: string;
  enabled?: boolean;
  tools?: { include?: string[]; exclude?: string[] };
}

// 追加到现有 agentsApi 对象：
  async getAgentMcpServers(agentId: string): Promise<AgentMcpServer[]> {
    const r = await invoke<{ servers: AgentMcpServer[] }>("getAgentMcpServers", { agentId });
    return r.servers;
  },
  async addAgentMcpServer(agentId: string, server: AddAgentMcpServerInput): Promise<AgentMcpServer> {
    return await invoke("addAgentMcpServer", { agentId, server });
  },
  async replaceAgentMcpServers(agentId: string, servers: Record<string, unknown>): Promise<void> {
    await invoke("replaceAgentMcpServers", { agentId, servers });
  },
  async deleteAgentMcpServer(agentId: string, name: string): Promise<void> {
    await invoke("deleteAgentMcpServer", { agentId, name });
  },
  async testAgentMcpServer(agentId: string, name: string): Promise<AgentMcpTestResult> {
    return await invoke("testAgentMcpServer", { agentId, name });
  },
  async setAgentMcpServerEnabled(agentId: string, name: string, enabled: boolean): Promise<void> {
    await invoke("setAgentMcpServerEnabled", { agentId, name, enabled });
  },
  async setAgentMcpServerTools(
    agentId: string, name: string,
    tools: { include?: string[]; exclude?: string[] },
  ): Promise<void> {
    await invoke("setAgentMcpServerTools", { agentId, name, ...tools });
  },
```

### 4.3 UI 落点

`src/components/chat/HermesAgentsPage.tsx`（当前 1739 行，尚无 MCP 区块）。建议：

- 在 agent 详情/设置区新增一个「MCP 服务器」分区（可参照现有模型/环境变量分区的交互）。
- 列表行显示 `name / transport / enabled 开关 / 工具数`；点击行展开编辑。
- 「测试连接」按钮 → `testAgentMcpServer` → 用返回的 `tools` 渲染工具勾选清单，再 `setAgentMcpServerTools`。
- `env` 一律留空重填（脱敏值不可回显为密码框的初值）。
- 保存后若响应 `restart_required`，弹「重启 Agent 后生效」提示或直接调 `restartAgent`。

---

## 5. 快速自测（不依赖前端）

```bash
# 列出现有 agent，拿 hermes-profile-xxx
curl -s http://127.0.0.1:8640/v1/agents | jq '.agents[].id'

ID=hermes-profile-testagent

# 加一个 stdio server
curl -s -X POST http://127.0.0.1:8640/v1/agents/$ID/mcp \
  -H 'Content-Type: application/json' \
  -d '{"name":"github","command":"npx","args":["-y","@modelcontextprotocol/server-github"]}'

# 列表
curl -s http://127.0.0.1:8640/v1/agents/$ID/mcp | jq

# 测试连通性
curl -s -X POST http://127.0.0.1:8640/v1/agents/$ID/mcp/github/test | jq

# 启停 / 工具
curl -s -X PUT http://127.0.0.1:8640/v1/agents/$ID/mcp/github/enabled -H 'Content-Type: application/json' -d '{"enabled":false}'
curl -s -X PUT http://127.0.0.1:8640/v1/agents/$ID/mcp/github/tools   -H 'Content-Type: application/json' -d '{"include":[]}'

# 删除
curl -s -X DELETE http://127.0.0.1:8640/v1/agents/$ID/mcp/github
```

配置落盘位置：`~/.hermes/profiles/{name}/config.yaml` → `mcp_servers:`。

---

## 6. 错误速查

| 状态码 | 场景 |
|---|---|
| 200 | 成功（含 test 的 `ok:false` 连接失败） |
| 201 | POST 新增成功 |
| 400 | JSON 非法 / 缺 `name` / `url`+`command` 冲突 / 命中安全校验 / 非 `hermes-profile` agent |
| 404 | profile 不存在 / server 不存在 |
| 500 | 后端内部错误 |

错误响应体统一为 `{ "error": "描述" }`。
