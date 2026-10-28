import { useTranslation } from "react-i18next";
import { FormLabel } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

interface LocalProxyRequestOverridesFieldProps {
  /** 请求头覆盖 JSON 文本（空字符串表示不覆盖） */
  headersJson: string;
  /** 请求体覆盖 JSON 文本（空字符串表示不覆盖） */
  bodyJson: string;
  onHeadersJsonChange: (value: string) => void;
  onBodyJsonChange: (value: string) => void;
  /** 分组说明 */
  help: string;
}

/** 解析 JSON 对象；空字符串或非对象返回 null（表示不覆盖） */
export function parseJsonObjectOverride(
  raw: string,
): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isValidJson(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return parseJsonObjectOverride(raw) !== null;
}

/**
 * 本地代理请求覆盖：在格式转换之后、发往上游之前合并请求头 / 请求体。
 *
 * 只在本地路由模式下生效。非法 JSON 不会阻断保存，但会被忽略。
 */
export function LocalProxyRequestOverridesField({
  headersJson,
  bodyJson,
  onHeadersJsonChange,
  onBodyJsonChange,
  help,
}: LocalProxyRequestOverridesFieldProps) {
  const { t } = useTranslation();
  const headersValid = isValidJson(headersJson);
  const bodyValid = isValidJson(bodyJson);

  return (
    <div className="space-y-2">
      <FormLabel>
        {t("providerForm.localProxyRequestOverrides", {
          defaultValue: "本地代理请求覆盖",
        })}
      </FormLabel>
      <p className="text-xs text-muted-foreground">{help}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("providerForm.localProxyHeadersJson", {
              defaultValue: "请求头覆盖 (JSON)",
            })}
          </span>
          <Textarea
            value={headersJson}
            onChange={(e) => onHeadersJsonChange(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={'{\n  "x-custom-header": "value"\n}'}
            className="font-mono text-xs"
          />
          {!headersValid && (
            <p className="text-xs text-destructive">
              {t("providerForm.localProxyOverridesInvalid", {
                defaultValue: "JSON 格式不正确，该覆盖将被忽略",
              })}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("providerForm.localProxyBodyJson", {
              defaultValue: "请求体覆盖 (JSON)",
            })}
          </span>
          <Textarea
            value={bodyJson}
            onChange={(e) => onBodyJsonChange(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={'{\n  "temperature": 0.7\n}'}
            className="font-mono text-xs"
          />
          {!bodyValid && (
            <p className="text-xs text-destructive">
              {t("providerForm.localProxyOverridesInvalid", {
                defaultValue: "JSON 格式不正确，该覆盖将被忽略",
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
