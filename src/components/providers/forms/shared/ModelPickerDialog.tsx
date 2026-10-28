import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FetchedModel } from "@/lib/api/model-fetch";

interface ModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已拉取到的可用模型列表（本组件不负责请求） */
  models: FetchedModel[];
  /** 打开时预先勾选的模型 ID（通常是上一次的选择或当前正在使用的模型） */
  initialSelectedIds?: string[];
  /** 最多可勾选的数量；不传表示不限 */
  maxSelectable?: number;
  onConfirm: (ids: string[]) => void;
}

/**
 * 模型勾选弹窗：搜索 + 全选 + 勾选后确认。
 *
 * 确认时按服务端返回的顺序回传 ID，便于调用方依次填充到各模型角色。
 */
export function ModelPickerDialog({
  open,
  onOpenChange,
  models,
  initialSelectedIds,
  maxSelectable,
  onConfirm,
}: ModelPickerDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 每次打开都清空搜索，并把上一次的选择（或当前使用的模型）预勾上
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const available = new Set(models.map((m) => m.id));
    const preselect = (initialSelectedIds ?? []).filter((id) =>
      available.has(id),
    );
    setSelected(new Set(preselect.slice(0, maxSelectable ?? preselect.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => m.id.toLowerCase().includes(q)) : models;
  }, [models, query]);

  const isFull = maxSelectable !== undefined && selected.size >= maxSelectable;

  const allSelected =
    visibleModels.length > 0 && visibleModels.every((m) => selected.has(m.id));
  const someSelected = visibleModels.some((m) => selected.has(m.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const m of visibleModels) next.delete(m.id);
        return next;
      }
      for (const m of visibleModels) {
        if (maxSelectable !== undefined && next.size >= maxSelectable) break;
        next.add(m.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (maxSelectable !== undefined && next.size >= maxSelectable) {
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    // 保持服务端返回的顺序，而不是勾选顺序
    const ids = models.map((m) => m.id).filter((id) => selected.has(id));
    onConfirm(ids);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md focus:outline-none" zIndex="top">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("providerForm.modelPickerTitle", {
              defaultValue: "选择要添加的模型",
            })}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("providerForm.modelPickerDesc", {
              defaultValue: "以下是模型提供商的可用模型，勾选要添加的模型。",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("providerForm.modelPickerSearch", {
              defaultValue: "搜索模型",
            })}
            className="h-8 text-xs"
          />
          <label className="flex shrink-0 cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={
                allSelected ? true : someSelected ? "indeterminate" : false
              }
              onCheckedChange={toggleAll}
              disabled={visibleModels.length === 0}
            />
            {t("providerForm.modelPickerSelectAll", {
              defaultValue: "全选",
            })}
          </label>
        </div>

        <div className="h-[46vh] min-h-40 overflow-y-auto rounded-md border">
          {visibleModels.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {models.length === 0
                ? t("providerForm.modelPickerEmpty", {
                    defaultValue: "该提供商未返回可用模型",
                  })
                : t("providerForm.modelPickerNoMatch", {
                    defaultValue: "没有匹配的模型",
                  })}
            </div>
          ) : (
            <div className="p-1">
              {visibleModels.map((m) => {
                const checked = selected.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                      !checked && isFull
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-muted/60"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!checked && isFull}
                      onCheckedChange={() => toggleOne(m.id)}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {m.id}
                    </span>
                    {m.ownedBy ? (
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

        {maxSelectable !== undefined && (
          <p className="text-xs text-muted-foreground">
            {t("providerForm.modelPickerLimit", {
              defaultValue: "按列表顺序填入模型角色，最多可选 {{count}} 个。",
              count: maxSelectable,
            })}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("providerForm.modelPickerCancel", { defaultValue: "取消" })}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            {selected.size > 0
              ? t("providerForm.modelPickerConfirmCount", {
                  defaultValue: "添加所选 ({{count}})",
                  count: selected.size,
                })
              : t("providerForm.modelPickerConfirm", {
                  defaultValue: "添加所选",
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
