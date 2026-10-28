import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Server, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  useAgentMcpServers,
  useDeleteMcpServer,
  useSetMcpServerEnabled,
  useTestMcpServer,
  useUpsertMcpServer,
} from "@/hooks/useAgentMcp";
import type {
  AgentMcpServer,
  AgentMcpServerInput,
  McpProtocol,
  McpTestResult,
  McpTransport,
} from "@/lib/api/agentMcp";

const NEWLINE = String.fromCharCode(10);

const AREA_CLASS =
  "w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none";

const PROTOCOLS: McpProtocol[] = ["auto", "stateless", "legacy"];

interface Row {
  key: string;
  value: string;
}

const EMPTY_ROW: Row = { key: "", value: "" };

type ToolsMode = "all" | "include" | "exclude";

function rowsToRecord(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
}

function recordToRows(record?: Record<string, string>): Row[] {
  const entries = Object.entries(record ?? {});
  if (entries.length === 0) return [{ ...EMPTY_ROW }];
  return entries.map(([key, value]) => ({ key, value }));
}

/** 换行或逗号分隔 → 去空后的列表 */
function parseList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(NEWLINE)) {
    for (const part of line.split(",")) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function toolsModeOf(server: AgentMcpServer): ToolsMode {
  if (server.tools?.include) return "include";
  if (server.tools?.exclude) return "exclude";
  return "all";
}

function toolsTextOf(server: AgentMcpServer): string {
  const list = server.tools?.include ?? server.tools?.exclude ?? [];
  return list.join(NEWLINE);
}

function endpointOf(server: AgentMcpServer): string {
  if (server.transport === "stdio") {
    return [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
  }
  return server.url ?? "";
}

interface AgentMcpPanelProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onRestart: () => void;
}

export function AgentMcpPanel({
  agentId,
  agentName,
  onClose,
  onRestart,
}: AgentMcpPanelProps) {
  const { t } = useTranslation();
  const {
    data: servers = [],
    isLoading,
    error,
    refetch,
  } = useAgentMcpServers(agentId);
  const upsertMutation = useUpsertMcpServer(agentId);
  const deleteMutation = useDeleteMcpServer(agentId);
  const enabledMutation = useSetMcpServerEnabled(agentId);
  const testMutation = useTestMcpServer(agentId);

  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("http");
  const [url, setUrl] = useState("");
  const [protocol, setProtocol] = useState<McpProtocol>("auto");
  const [headers, setHeaders] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envRows, setEnvRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [enabled, setEnabled] = useState(true);
  const [toolsMode, setToolsMode] = useState<ToolsMode>("all");
  const [toolsText, setToolsText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [testingName, setTestingName] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, McpTestResult>>(
    {},
  );
  const [needsRestart, setNeedsRestart] = useState(false);

  const resetForm = () => {
    setSelected(null);
    setName("");
    setTransport("http");
    setUrl("");
    setProtocol("auto");
    setHeaders([{ ...EMPTY_ROW }]);
    setCommand("");
    setArgsText("");
    setEnvRows([{ ...EMPTY_ROW }]);
    setEnabled(true);
    setToolsMode("all");
    setToolsText("");
  };

  const loadServer = (server: AgentMcpServer) => {
    setSelected(server.name);
    setName(server.name);
    setTransport(server.transport === "stdio" ? "stdio" : "http");
    setUrl(server.url ?? "");
    setProtocol(server.protocol ?? "auto");
    setHeaders([{ ...EMPTY_ROW }]);
    setCommand(server.command ?? "");
    setArgsText((server.args ?? []).join(NEWLINE));
    setEnvRows(recordToRows(server.env));
    setEnabled(server.enabled);
    setToolsMode(toolsModeOf(server));
    setToolsText(toolsTextOf(server));
  };

  const buildInput = (): AgentMcpServerInput | null => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t("hermes.mcp.nameRequired", { defaultValue: "请填写名称" }));
      return null;
    }
    const input: AgentMcpServerInput = {
      name: trimmedName,
      enabled,
      protocol,
    };
    if (transport === "http") {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        toast.error(
          t("hermes.mcp.urlRequired", { defaultValue: "请填写 URL" }),
        );
        return null;
      }
      input.url = trimmedUrl;
      const headerMap = rowsToRecord(headers);
      if (Object.keys(headerMap).length > 0) input.headers = headerMap;
    } else {
      const trimmedCommand = command.trim();
      if (!trimmedCommand) {
        toast.error(
          t("hermes.mcp.commandRequired", { defaultValue: "请填写命令" }),
        );
        return null;
      }
      input.command = trimmedCommand;
      const args = parseList(argsText);
      if (args.length > 0) input.args = args;
      const envMap = rowsToRecord(envRows);
      if (Object.keys(envMap).length > 0) input.env = envMap;
    }
    if (toolsMode !== "all") {
      const list = parseList(toolsText);
      input.tools =
        toolsMode === "include" ? { include: list } : { exclude: list };
    }
    return input;
  };

  const handleSubmit = () => {
    const input = buildInput();
    if (!input) return;
    upsertMutation.mutate(input, {
      onSuccess: (result) => {
        toast.success(
          t("hermes.mcp.saved", {
            defaultValue: "已保存，需重启该智能体后生效",
          }),
        );
        if (result?.restart_required !== false) setNeedsRestart(true);
        setSelected(input.name);
      },
      onError: (e) =>
        toast.error(t("hermes.mcp.saveFailed", { defaultValue: "保存失败" }), {
          description: String(e),
        }),
    });
  };

  const handleDelete = (target: string) => {
    deleteMutation.mutate(target, {
      onSuccess: (result) => {
        toast.success(t("hermes.mcp.deleted", { defaultValue: "已删除" }));
        if (result?.restart_required !== false) setNeedsRestart(true);
        setDeleteTarget(null);
        if (selected === target) resetForm();
      },
      onError: (e) => {
        toast.error(
          t("hermes.mcp.deleteFailed", { defaultValue: "删除失败" }),
          {
            description: String(e),
          },
        );
        setDeleteTarget(null);
      },
    });
  };

  const handleToggleEnabled = (server: AgentMcpServer, next: boolean) => {
    enabledMutation.mutate(
      { name: server.name, enabled: next },
      {
        onSuccess: (result) => {
          if (result?.restart_required !== false) setNeedsRestart(true);
        },
        onError: (e) =>
          toast.error(
            t("hermes.mcp.toggleFailed", { defaultValue: "切换失败" }),
            { description: String(e) },
          ),
      },
    );
  };

  const handleTest = (server: AgentMcpServer) => {
    setTestingName(server.name);
    testMutation.mutate(server.name, {
      onSuccess: (result) => {
        setTestResults((prev) => ({ ...prev, [server.name]: result }));
        if (result.ok) {
          toast.success(
            t("hermes.mcp.testOk", {
              count: result.tools.length,
              defaultValue: "连接成功，{{count}} 个工具",
            }),
          );
        } else {
          toast.error(t("hermes.mcp.testFail", { defaultValue: "连接失败" }), {
            description: result.error,
          });
        }
      },
      onError: (e) =>
        toast.error(t("hermes.mcp.testFail", { defaultValue: "连接失败" }), {
          description: String(e),
        }),
      onSettled: () => setTestingName(null),
    });
  };

  return (
    <div className="relative h-full rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {t("hermes.mcp.title", {
              name: agentName,
              defaultValue: "MCP 管理 — {{name}}",
            })}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mr-1"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {needsRestart && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-amber-500/10 shrink-0">
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {t("hermes.mcp.restartHint", {
              defaultValue: "配置已写入，需重启该智能体后生效",
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={onRestart}
          >
            <RotateCcw className="w-3 h-3" />
            {t("hermes.mcp.restartNow", { defaultValue: "立即重启" })}
          </Button>
        </div>
      )}

      {deleteTarget && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-xl">
          <div className="bg-card rounded-xl border shadow-lg p-6 w-72 space-y-4">
            <p className="text-sm font-semibold">
              {t("hermes.mcp.deleteTitle", {
                defaultValue: "确认删除 MCP 服务",
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("hermes.mcp.deleteDesc", {
                name: deleteTarget,
                defaultValue: '确定要删除 "{{name}}" 吗？此操作不可撤销。',
              })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                {t("common.cancel", { defaultValue: "取消" })}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? t("common.deleting", { defaultValue: "删除中..." })
                  : t("common.confirmDelete", { defaultValue: "确认删除" })}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-hidden">
        <div className="w-2/5 rounded-lg border bg-muted/20 overflow-y-auto p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("hermes.mcp.listTitle", { defaultValue: "MCP 服务" })}
            </span>
            <button
              className="text-[10px] text-primary hover:opacity-80"
              onClick={resetForm}
            >
              + {t("hermes.mcp.newServer", { defaultValue: "新建" })}
            </button>
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse">
              {t("common.loading", { defaultValue: "加载中..." })}
            </p>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-xs text-destructive break-all">
                {String(error)}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={() => void refetch()}
              >
                {t("hermes.agents.retry", { defaultValue: "重试" })}
              </Button>
            </div>
          ) : servers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("hermes.mcp.empty", {
                defaultValue: "暂无 MCP 服务，点击右侧表单添加",
              })}
            </p>
          ) : (
            <div className="space-y-1.5">
              {servers.map((server) => (
                <ServerRow
                  key={server.name}
                  server={server}
                  active={selected === server.name}
                  testResult={testResults[server.name]}
                  testing={testingName === server.name}
                  togglePending={enabledMutation.isPending}
                  onSelect={() => loadServer(server)}
                  onToggle={(next) => handleToggleEnabled(server, next)}
                  onTest={() => handleTest(server)}
                  onDelete={() => setDeleteTarget(server.name)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 rounded-lg border bg-muted/20 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {selected
                ? t("hermes.mcp.edit", {
                    name: selected,
                    defaultValue: "编辑 — {{name}}",
                  })
                : t("hermes.mcp.create", { defaultValue: "新建 MCP 服务" })}
            </span>

            <Field label={t("hermes.mcp.name", { defaultValue: "名称" })}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!selected}
                placeholder="smartpurchase-import"
                className="h-8 text-xs font-mono"
              />
            </Field>

            <Field
              label={t("hermes.mcp.transport", { defaultValue: "传输方式" })}
            >
              <div className="inline-flex gap-1 rounded-md bg-muted p-0.5">
                <SegBtn
                  active={transport === "http"}
                  onClick={() => setTransport("http")}
                >
                  {t("hermes.mcp.transportHttp", {
                    defaultValue: "HTTP / SSE",
                  })}
                </SegBtn>
                <SegBtn
                  active={transport === "stdio"}
                  onClick={() => setTransport("stdio")}
                >
                  {t("hermes.mcp.transportStdio", { defaultValue: "stdio" })}
                </SegBtn>
              </div>
            </Field>

            {transport === "http" ? (
              <>
                <Field label={t("hermes.mcp.url", { defaultValue: "URL" })}>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                    className="h-8 text-xs font-mono"
                  />
                </Field>

                <Field
                  label={t("hermes.mcp.protocol", { defaultValue: "协议协商" })}
                >
                  <div className="inline-flex gap-1 rounded-md bg-muted p-0.5">
                    {PROTOCOLS.map((p) => (
                      <SegBtn
                        key={p}
                        active={protocol === p}
                        onClick={() => setProtocol(p)}
                      >
                        {p}
                      </SegBtn>
                    ))}
                  </div>
                </Field>
                <Field
                  label={t("hermes.mcp.headers", { defaultValue: "请求头" })}
                  hint={t("hermes.mcp.headersHint", {
                    defaultValue: "写入 config.yaml；读取接口不回传",
                  })}
                >
                  <RowEditor
                    rows={headers}
                    onChange={setHeaders}
                    keyPlaceholder="Authorization"
                    valuePlaceholder="Bearer sk-..."
                  />
                </Field>
              </>
            ) : (
              <>
                <Field
                  label={t("hermes.mcp.command", { defaultValue: "命令" })}
                >
                  <Input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npx"
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field
                  label={t("hermes.mcp.args", { defaultValue: "参数" })}
                  hint={t("hermes.mcp.argsHint", { defaultValue: "每行一个" })}
                >
                  <textarea
                    value={argsText}
                    onChange={(e) => setArgsText(e.target.value)}
                    rows={3}
                    className={AREA_CLASS}
                  />
                </Field>
                <Field
                  label={t("hermes.mcp.env", { defaultValue: "环境变量" })}
                >
                  <RowEditor
                    rows={envRows}
                    onChange={setEnvRows}
                    keyPlaceholder="API_KEY"
                    valuePlaceholder="sk-..."
                  />
                </Field>
              </>
            )}
            <Field label={t("hermes.mcp.tools", { defaultValue: "工具过滤" })}>
              <div className="inline-flex gap-1 rounded-md bg-muted p-0.5">
                <SegBtn
                  active={toolsMode === "all"}
                  onClick={() => setToolsMode("all")}
                >
                  {t("hermes.mcp.toolsAll", { defaultValue: "不限制" })}
                </SegBtn>
                <SegBtn
                  active={toolsMode === "include"}
                  onClick={() => setToolsMode("include")}
                >
                  {t("hermes.mcp.toolsInclude", { defaultValue: "仅包含" })}
                </SegBtn>
                <SegBtn
                  active={toolsMode === "exclude"}
                  onClick={() => setToolsMode("exclude")}
                >
                  {t("hermes.mcp.toolsExclude", { defaultValue: "排除" })}
                </SegBtn>
              </div>
            </Field>
            {toolsMode !== "all" && (
              <Field
                label={t("hermes.mcp.toolsList", { defaultValue: "工具名" })}
                hint={t("hermes.mcp.toolsListHint", {
                  defaultValue: "每行一个；「仅包含」留空表示全部禁用",
                })}
              >
                <textarea
                  value={toolsText}
                  onChange={(e) => setToolsText(e.target.value)}
                  rows={3}
                  className={AREA_CLASS}
                />
              </Field>
            )}
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              {t("hermes.mcp.enabled", { defaultValue: "启用" })}
            </label>
          </div>
          <div className="border-t p-3 shrink-0">
            <Button
              className="w-full h-8 text-xs"
              onClick={handleSubmit}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending
                ? t("common.saving", { defaultValue: "保存中..." })
                : t("common.save", { defaultValue: "保存" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 text-xs transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RowEditor({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const { t } = useTranslation();
  const setAt = (index: number, patch: Partial<Row>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-1">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            value={row.key}
            placeholder={keyPlaceholder}
            className="h-7 text-xs font-mono flex-1"
            onChange={(e) => setAt(index, { key: e.target.value })}
          />
          <Input
            value={row.value}
            placeholder={valuePlaceholder}
            className="h-7 text-xs font-mono flex-[2]"
            onChange={(e) => setAt(index, { value: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() =>
              onChange(
                rows.length > 1
                  ? rows.filter((_, i) => i !== index)
                  : [{ key: "", value: "" }],
              )
            }
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <button
        type="button"
        className="text-[10px] text-primary hover:opacity-80"
        onClick={() => onChange([...rows, { key: "", value: "" }])}
      >
        + {t("hermes.mcp.addRow", { defaultValue: "添加一行" })}
      </button>
    </div>
  );
}

function ServerRow({
  server,
  active,
  testResult,
  testing,
  togglePending,
  onSelect,
  onToggle,
  onTest,
  onDelete,
}: {
  server: AgentMcpServer;
  active: boolean;
  testResult?: McpTestResult;
  testing: boolean;
  togglePending: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "rounded border px-2 py-1.5 transition-colors",
        active
          ? "border-primary/30 bg-primary/10"
          : "border-transparent hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold font-mono truncate">
              {server.name}
            </span>
            <span className="shrink-0 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
              {server.transport}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {endpointOf(server)}
          </p>
        </button>
        <Switch
          checked={server.enabled}
          disabled={togglePending}
          onCheckedChange={onToggle}
        />
      </div>
      <div className="flex items-center gap-1 pt-1">
        <button
          type="button"
          className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          onClick={onTest}
          disabled={testing}
        >
          <Zap className="w-3 h-3" />
          {testing
            ? t("hermes.mcp.testing", { defaultValue: "测试中..." })
            : t("hermes.mcp.test", { defaultValue: "测试" })}
        </button>
        {testResult ? (
          <span
            className={cn(
              "text-[10px]",
              testResult.ok ? "text-green-600" : "text-destructive",
            )}
            title={testResult.error}
          >
            {testResult.ok
              ? t("hermes.mcp.toolCount", {
                  count: testResult.tools.length,
                  defaultValue: "{{count}} 个工具",
                })
              : t("hermes.mcp.testFail", { defaultValue: "连接失败" })}
          </span>
        ) : null}
        <div className="flex-1" />
        <button
          type="button"
          className="px-1 text-[10px] rounded text-destructive hover:bg-destructive/10"
          onClick={onDelete}
        >
          {t("hermes.mcp.delete", { defaultValue: "删除" })}
        </button>
      </div>
    </div>
  );
}
