import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VoiceInputSettings as VoiceInputSettingsValue } from "@/types";

const LANGUAGE_AUTO = "auto";

/** 与后端 `VoiceInputSettings::default()` 保持一致 */
export const DEFAULT_TRANSCRIBE_BASE_URL = "http://134.175.238.232:8090";
export const DEFAULT_TRANSCRIBE_MODEL = "Qwen/Qwen3-ASR-1.7B-hf";

export interface VoiceInputSettingsProps {
  value?: VoiceInputSettingsValue;
  onChange: (value: VoiceInputSettingsValue) => void;
}

/**
 * 语音输入设置（聊天输入框的麦克风按钮）。
 *
 * 走 OpenAI 兼容的 `/v1/audio/transcriptions`，因此第三方中转站也能用。
 * API Key 只保存到后端，读取时后端只返回 `hasApiKey` 标记。
 */
export function VoiceInputSettings({
  value,
  onChange,
}: VoiceInputSettingsProps) {
  const { t } = useTranslation();
  const enabled = value?.enabled ?? true;
  const baseUrl = value?.baseUrl ?? DEFAULT_TRANSCRIBE_BASE_URL;
  const model = value?.model ?? DEFAULT_TRANSCRIBE_MODEL;
  const language = value?.language ?? LANGUAGE_AUTO;
  const hasApiKey = value?.hasApiKey ?? false;

  // 本地草稿，避免每次按键都写盘
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrl);
  const [modelDraft, setModelDraft] = useState(model);
  const [apiKeyDraft, setApiKeyDraft] = useState("");

  useEffect(() => {
    setBaseUrlDraft(baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    setModelDraft(model);
  }, [model]);

  const commit = (patch: Partial<VoiceInputSettingsValue>) => {
    onChange({
      enabled,
      baseUrl: baseUrlDraft.trim(),
      model: modelDraft.trim(),
      language: language === LANGUAGE_AUTO ? undefined : language,
      ...patch,
    });
  };

  const handleKeyBlur = () => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed) return;
    // apiKey 只在本次保存时上传；后端读取时会清空并回传 hasApiKey
    commit({ apiKey: trimmed });
    setApiKeyDraft("");
  };

  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {t("settings.voiceInput.title", { defaultValue: "语音输入" })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.voiceInput.hint", {
              defaultValue:
                "在聊天输入框显示麦克风按钮，录音后调用语音转写服务转成文字。",
            })}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => commit({ enabled: checked })}
        />
      </header>

      {enabled && (
        <div className="space-y-3 rounded-lg border border-border-default p-3">
          <div className="space-y-1.5">
            <Label htmlFor="voice-base-url" className="text-xs">
              {t("settings.voiceInput.baseUrl", {
                defaultValue: "API 地址",
              })}
            </Label>
            <Input
              id="voice-base-url"
              value={baseUrlDraft}
              onChange={(e) => setBaseUrlDraft(e.target.value)}
              onBlur={() => commit({ baseUrl: baseUrlDraft.trim() })}
              placeholder={DEFAULT_TRANSCRIBE_BASE_URL}
              className="h-8 text-xs"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("settings.voiceInput.baseUrlHint", {
                defaultValue:
                  "OpenAI 兼容地址，会自动补 /v1/audio/transcriptions；留空或填到 /v1 均可。",
              })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voice-api-key" className="text-xs">
              {t("settings.voiceInput.apiKey", { defaultValue: "API Key" })}
            </Label>
            <Input
              id="voice-api-key"
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              onBlur={handleKeyBlur}
              placeholder={
                hasApiKey
                  ? t("settings.voiceInput.apiKeySaved", {
                      defaultValue: "已保存，留空则不修改",
                    })
                  : t("settings.voiceInput.apiKeyPlaceholder", {
                      defaultValue: "sk-...",
                    })
              }
              className="h-8 text-xs"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="voice-model" className="text-xs">
                {t("settings.voiceInput.model", {
                  defaultValue: "转写模型",
                })}
              </Label>
              {/* 不同服务的模型名差异很大（whisper-1 / Qwen3-ASR / 自定义），用自由输入 */}
              <Input
                id="voice-model"
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                onBlur={() => commit({ model: modelDraft.trim() })}
                placeholder={DEFAULT_TRANSCRIBE_MODEL}
                className="h-8 text-xs"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="voice-language" className="text-xs">
                {t("settings.voiceInput.language", {
                  defaultValue: "识别语言",
                })}
              </Label>
              <Select
                value={language}
                onValueChange={(next) =>
                  commit({
                    language: next === LANGUAGE_AUTO ? undefined : next,
                  })
                }
              >
                <SelectTrigger id="voice-language" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LANGUAGE_AUTO}>
                    {t("settings.voiceInput.languageAuto", {
                      defaultValue: "自动识别",
                    })}
                  </SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
