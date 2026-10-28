import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isValidUserAgentHeader } from "@/lib/userAgent";
import { USER_AGENT_PRESETS } from "@/config/userAgentPresets";

interface CustomUserAgentFieldProps {
  /** 输入框 id（label htmlFor） */
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 字段说明 */
  help: string;
}

/**
 * 供应商级自定义 User-Agent 字段。
 *
 * 只在本地路由模式下生效，会替换转发到供应商 API 的请求里的 User-Agent。
 * 非法值（含控制字符）只是给出提示，运行时会被忽略。
 */
export function CustomUserAgentField({
  id,
  value,
  onChange,
  help,
}: CustomUserAgentFieldProps) {
  const { t } = useTranslation();
  const valid = isValidUserAgentHeader(value);

  return (
    <div className="space-y-2">
      <FormLabel htmlFor={id}>
        {t("providerForm.customUserAgent", {
          defaultValue: "自定义 User-Agent",
        })}
      </FormLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Mozilla/5.0 ..."
          autoComplete="off"
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="shrink-0 gap-1">
              {t("providerForm.customUserAgentPresets", {
                defaultValue: "预设",
              })}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-64 overflow-y-auto z-[200]"
          >
            {USER_AGENT_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset}
                onSelect={() => onChange(preset)}
                className="font-mono text-xs"
              >
                {preset}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
      {!valid && (
        <p className="text-xs text-destructive">
          {t("providerForm.customUserAgentInvalid", {
            defaultValue:
              "User-Agent 不能包含控制字符（如换行符），否则将被忽略。",
          })}
        </p>
      )}
    </div>
  );
}
