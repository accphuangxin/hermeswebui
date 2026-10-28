import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Download, Loader2, X } from "lucide-react";
import type { FetchedModel } from "@/lib/api/model-fetch";

interface ModelInputWithFetchProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fetchedModels: FetchedModel[];
  isLoading: boolean;
  /** 传入时显示获取按钮；不传时只在有数据后显示下拉 */
  onFetch?: () => void;
}

/**
 * 模型输入框：有拉取结果时变成可搜索的下拉框（选项 = 获取模型列表的返回），
 * 同时保留手动输入能力（搜索词不存在时可作为自定义模型名使用）。
 */
export function ModelInputWithFetch({
  id,
  value,
  onChange,
  placeholder,
  fetchedModels,
  isLoading,
  onFetch,
}: ModelInputWithFetchProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const keyword = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!keyword) return fetchedModels;
    return fetchedModels.filter((m) => m.id.toLowerCase().includes(keyword));
  }, [fetchedModels, keyword]);

  // 按 vendor 分组，保持服务端返回顺序
  const grouped = useMemo(() => {
    const map = new Map<string, FetchedModel[]>();
    for (const model of filtered) {
      const vendor = model.ownedBy || "Other";
      const list = map.get(vendor);
      if (list) list.push(model);
      else map.set(vendor, [model]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const trimmedQuery = query.trim();
  const canUseCustom =
    trimmedQuery.length > 0 &&
    !fetchedModels.some((m) => m.id === trimmedQuery);

  const closeAndSelect = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  // 有模型数据：可搜索下拉框
  if (fetchedModels.length > 0) {
    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        modal
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            className="flex h-9 w-full items-center justify-between gap-1 whitespace-nowrap rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className={cn(
                "min-w-0 truncate",
                !value && "text-muted-foreground",
              )}
            >
              {value ||
                placeholder ||
                t("providerForm.modelSelectPlaceholder", {
                  defaultValue: "选择或输入模型",
                })}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              {value && (
                <X
                  className="h-3.5 w-3.5 cursor-pointer opacity-50 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                />
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          avoidCollisions
          collisionPadding={8}
          className="z-[1000] w-[var(--radix-popover-trigger-width)] border-border-default p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t("providerForm.modelPickerSearch", {
                defaultValue: "搜索模型",
              })}
            />
            <CommandList>
              {grouped.length === 0 && !canUseCustom && (
                <CommandEmpty>
                  {t("providerForm.modelPickerNoMatch", {
                    defaultValue: "没有匹配的模型",
                  })}
                </CommandEmpty>
              )}
              {grouped.map(([vendor, models]) => (
                <CommandGroup key={vendor} heading={vendor}>
                  {models.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      onSelect={() => closeAndSelect(model.id)}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {model.id}
                      </span>
                      {value === model.id && (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {canUseCustom && (
                <CommandGroup>
                  <CommandItem
                    value={`__custom__${trimmedQuery}`}
                    onSelect={() => closeAndSelect(trimmedQuery)}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {t("providerForm.modelUseCustom", {
                        defaultValue: "使用自定义模型 “{{model}}”",
                        model: trimmedQuery,
                      })}
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  // 加载中: Input + Spinner
  if (isLoading) {
    return (
      <div className="flex gap-1">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1"
        />
        <Button variant="outline" size="icon" className="shrink-0" disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      </div>
    );
  }

  // 有 onFetch: Input + 获取按钮
  if (onFetch) {
    return (
      <div className="flex gap-1">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1"
        />
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          type="button"
          onClick={onFetch}
          title={t("providerForm.fetchModels")}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // 无 onFetch: 纯 Input
  return (
    <Input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
