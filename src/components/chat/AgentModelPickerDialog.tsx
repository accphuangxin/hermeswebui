import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchModelsForConfig, type FetchedModel } from "@/lib/api/model-fetch";

interface AgentModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseUrl: string;
  apiKey: string;
  /** 已存在的模型 ID，列表中标为「已添加」且不可重复勾选 */
  existingIds: string[];
  onConfirm: (ids: string[]) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; models: FetchedModel[] };

/**
 * 从已配置的 Base URL / API Key 拉取可用模型，供用户勾选后批量添加。
 *
 * 打开即自动请求；请求失败可重试。已存在的模型不可勾选，避免重复行。
 */
export function AgentModelPickerDialog({
  open,
  onOpenChange,
  baseUrl,
  apiKey,
  existingIds,
  onConfirm,
}: AgentModelPickerDialogProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const existing = useMemo(
    () => new Set(existingIds.map((id) => id.trim()).filter(Boolean)),
    [existingIds],
  );

  const load = useCallback(async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setState({
        kind: "error",
        message: t("hermes.agents.modelPicker.needConfig", {
          defaultValue: "请先填写 Base URL 和 API Key",
        }),
      });
      return;
    }
    setState({ kind: "loading" });
    try {
      const models = await fetchModelsForConfig(baseUrl.trim(), apiKey.trim());
      setState({ kind: "ready", models });
    } catch (err) {
      setState({
        kind: "error",
        message:
          String(err) ||
          t("hermes.agents.modelPicker.fetchFailed", {
            defaultValue: "获取模型列表失败",
          }),
      });
    }
  }, [baseUrl, apiKey, t]);

  // 每次打开都重新拉取，并清空上一次的搜索与勾选。
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(new Set());
    void load();
  }, [open, load]);

  const visibleModels = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = query.trim().toLowerCase();
    return q
      ? state.models.filter((m) => m.id.toLowerCase().includes(q))
      : state.models;
  }, [state, query]);

  const selectableModels = visibleModels.filter((m) => !existing.has(m.id));
  const allSelected =
    selectableModels.length > 0 &&
    selectableModels.every((m) => selected.has(m.id));
  const someSelected = selectableModels.some((m) => selected.has(m.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const m of selectableModels) next.delete(m.id);
      } else {
        for (const m of selectableModels) next.add(m.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    // 保持服务端返回的顺序，而不是勾选顺序
    if (state.kind !== "ready") return;
    const ids = state.models.map((m) => m.id).filter((id) => selected.has(id));
    onConfirm(ids);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md focus:outline-none">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("hermes.agents.modelPicker.title", {
              defaultValue: "选择要添加的模型",
            })}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("hermes.agents.modelPicker.desc", {
              defaultValue: "以下是模型提供商的可用模型，勾选要添加的模型。",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("hermes.agents.modelPicker.search", {
              defaultValue: "搜索模型",
            })}
            className="h-8 text-xs"
            disabled={state.kind !== "ready"}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={
                allSelected ? true : someSelected ? "indeterminate" : false
              }
              onCheckedChange={toggleAll}
              disabled={selectableModels.length === 0}
            />
            {t("hermes.agents.modelPicker.selectAll", {
              defaultValue: "全选",
            })}
          </label>
        </div>

        <div className="h-[46vh] min-h-40 overflow-y-auto rounded-md border">
          {state.kind === "loading" ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("hermes.agents.modelPicker.loading", {
                defaultValue: "正在获取模型...",
              })}
            </div>
          ) : state.kind === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-xs text-destructive break-all">
                {state.message}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => void load()}
              >
                <RotateCcw className="h-3 w-3" />
                {t("hermes.agents.modelPicker.retry", {
                  defaultValue: "重试",
                })}
              </Button>
            </div>
          ) : visibleModels.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {state.models.length === 0
                ? t("hermes.agents.modelPicker.empty", {
                    defaultValue: "该提供商未返回可用模型",
                  })
                : t("hermes.agents.modelPicker.noMatch", {
                    defaultValue: "没有匹配的模型",
                  })}
            </div>
          ) : (
            <div className="p-1">
              {visibleModels.map((m) => {
                const added = existing.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                      added
                        ? "cursor-default opacity-50"
                        : "cursor-pointer hover:bg-muted/60"
                    }`}
                  >
                    <Checkbox
                      checked={added || selected.has(m.id)}
                      disabled={added}
                      onCheckedChange={() => toggleOne(m.id)}
                    />
                    <span className="flex-1 min-w-0 truncate font-mono text-xs">
                      {m.id}
                    </span>
                    {added ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t("hermes.agents.modelPicker.alreadyAdded", {
                          defaultValue: "已添加",
                        })}
                      </span>
                    ) : m.ownedBy ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground/60">
                        {m.ownedBy}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("hermes.agents.modelPicker.cancel", { defaultValue: "取消" })}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            {selected.size > 0
              ? t("hermes.agents.modelPicker.confirmCount", {
                  defaultValue: "添加所选 ({{count}})",
                  count: selected.size,
                })
              : t("hermes.agents.modelPicker.confirm", {
                  defaultValue: "添加所选",
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
