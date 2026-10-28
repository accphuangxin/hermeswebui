import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Wand2,
} from "lucide-react";
import EndpointSpeedTest from "./EndpointSpeedTest";
import {
  ApiKeySection,
  EndpointField,
  ModelInputWithFetch,
  ModelPickerDialog,
} from "./shared";
import { CopilotAuthSection } from "./CopilotAuthSection";
import { CodexOAuthSection } from "./CodexOAuthSection";
import { CustomUserAgentField } from "./CustomUserAgentField";
import { LocalProxyRequestOverridesField } from "./LocalProxyRequestOverridesField";
import {
  copilotGetModels,
  copilotGetModelsForAccount,
} from "@/lib/api/copilot";
import type { CopilotModel } from "@/lib/api/copilot";
import {
  fetchModelsForConfig,
  showFetchModelsError,
  type FetchedModel,
} from "@/lib/api/model-fetch";
import type {
  ProviderCategory,
  ClaudeApiFormat,
  ClaudeApiKeyField,
} from "@/types";
import {
  hasClaudeOneMMarker,
  setClaudeOneMMarker,
  stripClaudeOneMMarker,
  type ClaudeModelEnvField,
} from "./hooks/useModelState";
import {
  providerPresets,
  type TemplateValueConfig,
} from "@/config/claudeProviderPresets";

interface EndpointCandidate {
  url: string;
}

interface ClaudeFormFieldsProps {
  providerId?: string;
  // API Key
  shouldShowApiKey: boolean;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  category?: ProviderCategory;
  shouldShowApiKeyLink: boolean;
  websiteUrl: string;

  // GitHub Copilot OAuth
  isCopilotPreset?: boolean;
  usesOAuth?: boolean;
  isCopilotAuthenticated?: boolean;
  /** 当前选中的 GitHub 账号 ID（多账号支持） */
  selectedGitHubAccountId?: string | null;
  /** GitHub 账号选择回调（多账号支持） */
  onGitHubAccountSelect?: (accountId: string | null) => void;

  // Codex OAuth (ChatGPT Plus/Pro)
  isCodexOauthPreset?: boolean;
  isCodexOauthAuthenticated?: boolean;
  selectedCodexAccountId?: string | null;
  onCodexAccountSelect?: (accountId: string | null) => void;
  codexFastMode?: boolean;
  onCodexFastModeChange?: (enabled: boolean) => void;

  // Template Values
  templateValueEntries: Array<[string, TemplateValueConfig]>;
  templateValues: Record<string, TemplateValueConfig>;
  templatePresetName: string;
  onTemplateValueChange: (key: string, value: string) => void;

  // Base URL
  shouldShowSpeedTest: boolean;
  baseUrl: string;
  onBaseUrlChange: (url: string) => void;
  isEndpointModalOpen: boolean;
  onEndpointModalToggle: (open: boolean) => void;
  onCustomEndpointsChange?: (endpoints: string[]) => void;
  autoSelect: boolean;
  onAutoSelectChange: (checked: boolean) => void;
  showEndpointTools?: boolean;

  // Model Selector
  shouldShowModelSelector: boolean;
  claudeModel: string;
  defaultHaikuModel: string;
  defaultSonnetModel: string;
  defaultOpusModel: string;
  defaultFableModel: string;
  subagentModel: string;
  defaultHaikuModelName: string;
  defaultSonnetModelName: string;
  defaultOpusModelName: string;
  defaultFableModelName: string;
  onModelChange: (field: ClaudeModelEnvField, value: string) => void;

  // Speed Test Endpoints
  speedTestEndpoints: EndpointCandidate[];

  // API Format (for Claude-compatible providers that need request/response conversion)
  apiFormat: ClaudeApiFormat;
  onApiFormatChange: (format: ClaudeApiFormat) => void;

  // Auth Field (ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY)
  apiKeyField: ClaudeApiKeyField;
  onApiKeyFieldChange: (field: ClaudeApiKeyField) => void;

  // Full URL mode
  isFullUrl: boolean;
  onFullUrlChange: (value: boolean) => void;

  // 自定义 User-Agent（仅本地路由生效）
  customUserAgent: string;
  onCustomUserAgentChange: (value: string) => void;

  // 本地代理请求覆盖（仅本地路由生效）
  localProxyHeadersOverride: string;
  onLocalProxyHeadersOverrideChange: (value: string) => void;
  localProxyBodyOverride: string;
  onLocalProxyBodyOverrideChange: (value: string) => void;

  // 用户在「获取模型列表」弹窗里勾选的模型集合（持久化在 provider.meta.availableModels）
  availableModels: string[];
  onAvailableModelsChange: (models: string[]) => void;
}

export function ClaudeFormFields({
  providerId,
  shouldShowApiKey,
  apiKey,
  onApiKeyChange,
  category,
  shouldShowApiKeyLink,
  websiteUrl,
  isCopilotPreset,
  usesOAuth,
  isCopilotAuthenticated,
  selectedGitHubAccountId,
  onGitHubAccountSelect,
  isCodexOauthPreset,
  selectedCodexAccountId,
  onCodexAccountSelect,
  codexFastMode,
  onCodexFastModeChange,
  templateValueEntries,
  templateValues,
  templatePresetName,
  onTemplateValueChange,
  shouldShowSpeedTest,
  baseUrl,
  onBaseUrlChange,
  isEndpointModalOpen,
  onEndpointModalToggle,
  onCustomEndpointsChange,
  autoSelect,
  onAutoSelectChange,
  showEndpointTools = true,
  shouldShowModelSelector,
  claudeModel,
  defaultHaikuModel,
  defaultSonnetModel,
  defaultOpusModel,
  onModelChange,
  speedTestEndpoints,
  apiFormat,
  onApiFormatChange,
  apiKeyField,
  onApiKeyFieldChange,
  isFullUrl,
  onFullUrlChange,
  defaultFableModel,
  subagentModel,
  defaultHaikuModelName,
  defaultSonnetModelName,
  defaultOpusModelName,
  defaultFableModelName,
  customUserAgent,
  onCustomUserAgentChange,
  localProxyHeadersOverride,
  onLocalProxyHeadersOverrideChange,
  localProxyBodyOverride,
  onLocalProxyBodyOverrideChange,
  availableModels,
  onAvailableModelsChange,
}: ClaudeFormFieldsProps) {
  const { t } = useTranslation();
  const hasAnyAdvancedValue = !!(
    claudeModel ||
    defaultHaikuModel ||
    defaultSonnetModel ||
    defaultOpusModel ||
    defaultFableModel ||
    subagentModel ||
    defaultHaikuModelName ||
    defaultSonnetModelName ||
    defaultOpusModelName ||
    defaultFableModelName ||
    customUserAgent ||
    localProxyHeadersOverride.trim() ||
    localProxyBodyOverride.trim() ||
    apiFormat !== "anthropic" ||
    apiKeyField !== "ANTHROPIC_AUTH_TOKEN"
  );
  const [advancedExpanded, setAdvancedExpanded] = useState(hasAnyAdvancedValue);

  // 预设填充高级值后自动展开（仅从折叠→展开，不会自动折叠）
  useEffect(() => {
    if (hasAnyAdvancedValue) {
      setAdvancedExpanded(true);
    }
  }, [hasAnyAdvancedValue]);

  // Copilot 可用模型列表
  const [copilotModels, setCopilotModels] = useState<CopilotModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // 通用模型获取（非 Copilot 供应商）
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  // 获取成功后弹出勾选框，让用户挑选要填入模型角色的模型
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  // 「实际请求模型」下拉框的候选 = 用户在勾选框里选好的模型集合。
  // 集合持久化在 provider.meta.availableModels，所以重开编辑面板后依然是同一批。
  // 本次刚拉取过列表时，用返回结果补上 ownedBy 之类的展示信息。
  const modelOptions = useMemo<FetchedModel[]>(() => {
    const byId = new Map(fetchedModels.map((m) => [m.id, m]));
    return availableModels.map((id) => byId.get(id) ?? { id, ownedBy: null });
  }, [availableModels, fetchedModels]);

  const handleFetchModels = useCallback(() => {
    if (!baseUrl || !apiKey) {
      showFetchModelsError(null, t, {
        hasApiKey: !!apiKey,
        hasBaseUrl: !!baseUrl,
      });
      return;
    }
    // 当 baseURL 仍是某预设的默认值时，优先使用预设上的 modelsUrl 覆写
    // 避免多走一次失败的候选请求（如 DeepSeek 把 /models 挂在根，而不是 /anthropic 子路径下）
    const matchedPreset = providerPresets.find((p) => {
      const env = (p.settingsConfig as { env?: Record<string, string> })?.env;
      return env?.ANTHROPIC_BASE_URL === baseUrl;
    });
    const modelsUrl = matchedPreset?.modelsUrl;

    setIsFetchingModels(true);
    fetchModelsForConfig(baseUrl, apiKey, isFullUrl, modelsUrl)
      .then((models) => {
        setFetchedModels(models);
        if (models.length === 0) {
          toast.info(t("providerForm.fetchModelsEmpty"));
        } else {
          // 不再直接提示成功，交由勾选框完成选择
          setIsModelPickerOpen(true);
        }
      })
      .catch((err) => {
        console.warn("[ModelFetch] Failed:", err);
        showFetchModelsError(err, t);
      })
      .finally(() => setIsFetchingModels(false));
  }, [baseUrl, apiKey, isFullUrl, t]);

  // 当 Copilot 预设且已认证时，加载可用模型
  useEffect(() => {
    // 如果不是 Copilot 预设或未认证，清空模型列表
    if (!isCopilotPreset || !isCopilotAuthenticated) {
      setCopilotModels([]);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    const fetchModels = selectedGitHubAccountId
      ? copilotGetModelsForAccount(selectedGitHubAccountId)
      : copilotGetModels();

    fetchModels
      .then((models) => {
        if (!cancelled) setCopilotModels(models);
      })
      .catch((err) => {
        console.warn("[Copilot] Failed to fetch models:", err);
        if (!cancelled) {
          toast.error(
            t("copilot.loadModelsFailed", {
              defaultValue: "加载 Copilot 模型列表失败",
            }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCopilotPreset, isCopilotAuthenticated, selectedGitHubAccountId]);

  // 模型输入框：支持手动输入 + 下拉选择
  const renderModelInput = (
    id: string,
    value: string,
    field: ClaudeModelEnvField,
    placeholder?: string,
    /** 可选：自定义写入逻辑（用于保留 1M 声明、联动显示名称） */
    onChangeOverride?: (value: string) => void,
  ) => {
    const applyValue =
      onChangeOverride ?? ((v: string) => onModelChange(field, v));
    if (isCopilotPreset && copilotModels.length > 0) {
      // 按 vendor 分组
      const grouped: Record<string, CopilotModel[]> = {};
      for (const model of copilotModels) {
        const vendor = model.vendor || "Other";
        if (!grouped[vendor]) grouped[vendor] = [];
        grouped[vendor].push(model);
      }
      const vendors = Object.keys(grouped).sort();

      return (
        <div className="flex gap-1">
          <Input
            id={id}
            type="text"
            value={value}
            onChange={(e) => applyValue(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-64 overflow-y-auto z-[200]"
            >
              {vendors.map((vendor, vi) => (
                <div key={vendor}>
                  {vi > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{vendor}</DropdownMenuLabel>
                  {grouped[vendor].map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onSelect={() => applyValue(model.id)}
                    >
                      {model.id}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }

    if (isCopilotPreset && modelsLoading) {
      return (
        <div className="flex gap-1">
          <Input
            id={id}
            type="text"
            value={value}
            onChange={(e) => applyValue(e.target.value)}
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

    // 非 Copilot 供应商: 使用 ModelInputWithFetch（获取按钮在 section 标题旁）
    return (
      <ModelInputWithFetch
        id={id}
        value={value}
        onChange={applyValue}
        placeholder={placeholder}
        fetchedModels={modelOptions}
        isLoading={isFetchingModels}
      />
    );
  };

  // ── 模型映射：角色行（显示名称 → 实际请求模型 → 1M 声明） ──────────
  type ModelRoleRow = {
    key: string;
    label: string;
    model: string;
    modelField: ClaudeModelEnvField;
    displayName?: string;
    displayNameField?: ClaudeModelEnvField;
    inputId: string;
  };

  const modelRoleRows: ModelRoleRow[] = [
    {
      key: "sonnet",
      label: t("providerForm.modelRoleSonnet", { defaultValue: "Sonnet" }),
      model: defaultSonnetModel,
      modelField: "ANTHROPIC_DEFAULT_SONNET_MODEL",
      displayName: defaultSonnetModelName,
      displayNameField: "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME",
      inputId: "claudeDefaultSonnetModel",
    },
    {
      key: "opus",
      label: t("providerForm.modelRoleOpus", { defaultValue: "Opus" }),
      model: defaultOpusModel,
      modelField: "ANTHROPIC_DEFAULT_OPUS_MODEL",
      displayName: defaultOpusModelName,
      displayNameField: "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME",
      inputId: "claudeDefaultOpusModel",
    },
    {
      key: "fable",
      label: t("providerForm.modelRoleFable", { defaultValue: "Fable" }),
      model: defaultFableModel,
      modelField: "ANTHROPIC_DEFAULT_FABLE_MODEL",
      displayName: defaultFableModelName,
      displayNameField: "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME",
      inputId: "claudeDefaultFableModel",
    },
    {
      key: "haiku",
      label: t("providerForm.modelRoleHaiku", { defaultValue: "Haiku" }),
      model: defaultHaikuModel,
      modelField: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      displayName: defaultHaikuModelName,
      displayNameField: "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME",
      inputId: "claudeDefaultHaikuModel",
    },
    {
      key: "subagent",
      label: t("providerForm.modelRoleSubagent", {
        defaultValue: "Subagent",
      }),
      model: subagentModel,
      modelField: "CLAUDE_CODE_SUBAGENT_MODEL",
      inputId: "claudeCodeSubagentModel",
    },
  ];

  // 写入某一行：保留 1M 声明；显示名称为空或仍等于旧模型名时自动跟随
  const writeRoleModel = (row: ModelRoleRow, rawValue: string) => {
    const enabled = hasClaudeOneMMarker(rawValue);
    const oldBase = stripClaudeOneMMarker(row.model).trim();
    const base = stripClaudeOneMMarker(rawValue).trim();
    onModelChange(row.modelField, setClaudeOneMMarker(base, enabled));
    if (row.displayNameField) {
      const currentName = (row.displayName ?? "").trim();
      if (!currentName || currentName === oldBase) {
        onModelChange(row.displayNameField, base);
      }
    }
  };

  const handleRoleModelChange = (row: ModelRoleRow, value: string) => {
    // 输入框编辑时保留原来的 1M 状态
    writeRoleModel(
      row,
      setClaudeOneMMarker(value, hasClaudeOneMMarker(row.model)),
    );
  };

  const handleRoleOneMChange = (row: ModelRoleRow, enabled: boolean) => {
    writeRoleModel(row, setClaudeOneMMarker(row.model, enabled));
  };

  const fallbackUsesOneM = hasClaudeOneMMarker(claudeModel);

  const handleFallbackModelChange = (value: string) => {
    onModelChange(
      "ANTHROPIC_MODEL",
      setClaudeOneMMarker(value, fallbackUsesOneM),
    );
  };

  const handleFallbackOneMChange = (enabled: boolean) => {
    const base = stripClaudeOneMMarker(claudeModel).trim();
    if (!base) return;
    onModelChange("ANTHROPIC_MODEL", setClaudeOneMMarker(base, enabled));
  };

  const handleQuickSetModels = () => {
    const source =
      stripClaudeOneMMarker(defaultSonnetModel).trim() ||
      stripClaudeOneMMarker(defaultOpusModel).trim() ||
      stripClaudeOneMMarker(defaultFableModel).trim() ||
      stripClaudeOneMMarker(defaultHaikuModel).trim() ||
      stripClaudeOneMMarker(subagentModel).trim() ||
      stripClaudeOneMMarker(claudeModel).trim();
    if (!source) return;

    for (const row of modelRoleRows) {
      onModelChange(row.modelField, source);
      if (row.displayNameField) {
        onModelChange(row.displayNameField, source);
      }
    }
    toast.success(
      t("providerForm.quickSetSuccess", {
        defaultValue: "已将模型名称应用到所有字段",
      }),
    );
  };

  // 勾选确认后：把勾选结果写回 provider.meta.availableModels（下拉框候选），
  // 并按列表顺序依次填入 Sonnet / Opus / Fable / Haiku / Subagent
  const handleModelPickerConfirm = (ids: string[]) => {
    // 下拉框（实际请求模型）只列用户勾选的模型，保持服务端返回顺序
    onAvailableModelsChange(ids);

    const targets = modelRoleRows.slice(0, ids.length);
    targets.forEach((row, index) => {
      // 保留该行原来的 1M 勾选状态，避免替换模型时被静默清掉
      writeRoleModel(
        row,
        setClaudeOneMMarker(ids[index], hasClaudeOneMMarker(row.model)),
      );
    });
    toast.success(
      t("providerForm.modelPickerApplied", {
        defaultValue: "已填入 {{count}} 个模型",
        count: targets.length,
      }),
    );
  };

  // 打开勾选框时预勾选：已保存的选择优先，否则用当前各角色行正在使用的模型
  const pickerInitialSelectedIds =
    availableModels.length > 0
      ? availableModels
      : Array.from(
          new Set(
            modelRoleRows
              .map((row) => stripClaudeOneMMarker(row.model).trim())
              .concat(stripClaudeOneMMarker(claudeModel).trim())
              .filter(Boolean),
          ),
        );

  return (
    <>
      {/* GitHub Copilot OAuth 认证 */}
      {isCopilotPreset && (
        <CopilotAuthSection
          selectedAccountId={selectedGitHubAccountId}
          onAccountSelect={onGitHubAccountSelect}
        />
      )}

      {/* Codex OAuth 认证 (ChatGPT Plus/Pro) */}
      {isCodexOauthPreset && (
        <CodexOAuthSection
          selectedAccountId={selectedCodexAccountId}
          onAccountSelect={onCodexAccountSelect}
          fastModeEnabled={codexFastMode}
          onFastModeChange={onCodexFastModeChange}
        />
      )}

      {/* API Key 输入框（非 OAuth 预设时显示） */}
      {shouldShowApiKey && !usesOAuth && (
        <ApiKeySection
          value={apiKey}
          onChange={onApiKeyChange}
          category={category}
          shouldShowLink={shouldShowApiKeyLink}
          websiteUrl={websiteUrl}
        />
      )}

      {/* 模板变量输入 */}
      {templateValueEntries.length > 0 && (
        <div className="space-y-3">
          <FormLabel>
            {t("providerForm.parameterConfig", {
              name: templatePresetName,
              defaultValue: `${templatePresetName} 参数配置`,
            })}
          </FormLabel>
          <div className="space-y-4">
            {templateValueEntries.map(([key, config]) => (
              <div key={key} className="space-y-2">
                <FormLabel htmlFor={`template-${key}`}>
                  {config.label}
                </FormLabel>
                <Input
                  id={`template-${key}`}
                  type="text"
                  required
                  value={
                    templateValues[key]?.editorValue ??
                    config.editorValue ??
                    config.defaultValue ??
                    ""
                  }
                  onChange={(e) => onTemplateValueChange(key, e.target.value)}
                  placeholder={config.placeholder || config.label}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Base URL 输入框 */}
      {shouldShowSpeedTest && (
        <EndpointField
          id="baseUrl"
          label={t("providerForm.apiEndpoint")}
          value={baseUrl}
          onChange={onBaseUrlChange}
          placeholder={t("providerForm.apiEndpointPlaceholder")}
          hint={
            apiFormat === "openai_responses"
              ? t("providerForm.apiHintResponses")
              : apiFormat === "openai_chat"
                ? t("providerForm.apiHintOAI")
                : apiFormat === "gemini_native"
                  ? t("providerForm.apiHintGeminiNative")
                  : t("providerForm.apiHint")
          }
          fullUrlHint={
            apiFormat === "gemini_native"
              ? t("providerForm.fullUrlHintGeminiNative")
              : undefined
          }
          showManageButton={showEndpointTools}
          onManageClick={
            showEndpointTools ? () => onEndpointModalToggle(true) : undefined
          }
          showFullUrlToggle={showEndpointTools}
          isFullUrl={isFullUrl}
          onFullUrlChange={onFullUrlChange}
        />
      )}

      {/* 端点测速弹窗 */}
      {shouldShowSpeedTest && showEndpointTools && isEndpointModalOpen && (
        <EndpointSpeedTest
          appId="claude"
          providerId={providerId}
          value={baseUrl}
          onChange={onBaseUrlChange}
          initialEndpoints={speedTestEndpoints}
          visible={isEndpointModalOpen}
          onClose={() => onEndpointModalToggle(false)}
          autoSelect={autoSelect}
          onAutoSelectChange={onAutoSelectChange}
          onCustomEndpointsChange={onCustomEndpointsChange}
        />
      )}

      {/* 高级选项（API 格式 + 认证字段 + 模型映射） */}
      {shouldShowModelSelector && (
        <Collapsible open={advancedExpanded} onOpenChange={setAdvancedExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant={null}
              size="sm"
              className="h-8 gap-1.5 px-0 text-sm font-medium text-foreground hover:opacity-70"
            >
              {advancedExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {t("providerForm.advancedOptionsToggle")}
            </Button>
          </CollapsibleTrigger>
          {!advancedExpanded && (
            <p className="text-xs text-muted-foreground mt-1 ml-1">
              {t("providerForm.advancedOptionsHint")}
            </p>
          )}
          <CollapsibleContent className="space-y-4 pt-2">
            {/* API 格式选择（仅非云服务商显示） */}
            {category !== "cloud_provider" && (
              <div className="space-y-2">
                <FormLabel htmlFor="apiFormat">
                  {t("providerForm.upstreamFormat", {
                    defaultValue: "上游格式",
                  })}
                </FormLabel>
                <Select value={apiFormat} onValueChange={onApiFormatChange}>
                  <SelectTrigger id="apiFormat" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">
                      {t("providerForm.apiFormatAnthropic", {
                        defaultValue: "Anthropic Messages (原生)",
                      })}
                    </SelectItem>
                    <SelectItem value="openai_chat">
                      {t("providerForm.apiFormatOpenAIChat", {
                        defaultValue: "OpenAI Chat Completions (需转换)",
                      })}
                    </SelectItem>
                    <SelectItem value="openai_responses">
                      {t("providerForm.apiFormatOpenAIResponses", {
                        defaultValue: "OpenAI Responses API (需转换)",
                      })}
                    </SelectItem>
                    <SelectItem value="gemini_native">
                      {t("providerForm.apiFormatGeminiNative", {
                        defaultValue: "Gemini Native generateContent (需转换)",
                      })}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("providerForm.apiFormatHelp", {
                    defaultValue:
                      "供应商原生为 Anthropic Messages API 就选 Anthropic Messages（直连，不转换格式）；使用 Chat Completions 协议就选 Chat；使用 Responses API 就选 Responses；使用 Gemini generateContent 协议就选 Gemini Native。Chat、Responses 与 Gemini Native 均需开启路由才能转换为 Anthropic Messages。",
                  })}
                </p>
              </div>
            )}

            {/* 认证字段选择器 */}
            <div className="space-y-2">
              <FormLabel>
                {t("providerForm.authField", { defaultValue: "认证字段" })}
              </FormLabel>
              <Select
                value={apiKeyField}
                onValueChange={(v) =>
                  onApiKeyFieldChange(v as ClaudeApiKeyField)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANTHROPIC_AUTH_TOKEN">
                    {t("providerForm.authFieldAuthToken", {
                      defaultValue: "ANTHROPIC_AUTH_TOKEN（默认）",
                    })}
                  </SelectItem>
                  <SelectItem value="ANTHROPIC_API_KEY">
                    {t("providerForm.authFieldApiKey", {
                      defaultValue: "ANTHROPIC_API_KEY",
                    })}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("providerForm.authFieldHint", {
                  defaultValue: "选择写入配置的认证环境变量名",
                })}
              </p>
            </div>

            {/* 模型映射 */}
            <div className="space-y-3 pt-3 border-t">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FormLabel>{t("providerForm.modelMappingLabel")}</FormLabel>
                <div className="flex gap-2">
                  {/* 一键设置按钮 */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleQuickSetModels}
                    disabled={
                      !modelRoleRows.some((row) => row.model.trim()) &&
                      !claudeModel.trim()
                    }
                    className="h-7 gap-1"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {t("providerForm.quickSetModels", {
                      defaultValue: "一键设置",
                    })}
                  </Button>
                  {!isCopilotPreset && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="h-7 gap-1"
                    >
                      {isFetchingModels ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {t("providerForm.fetchModels")}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("providerForm.modelMappingTableHint", {
                  defaultValue:
                    "显示名称只影响 /model 菜单；1M 只是给 Claude Code 的上下文能力声明。",
                })}
              </p>

              {/* 表头 */}
              <div className="hidden grid-cols-[120px_1fr_minmax(0,1fr)_104px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
                <span>
                  {t("providerForm.modelRoleLabel", {
                    defaultValue: "模型角色",
                  })}
                </span>
                <span>
                  {t("providerForm.modelDisplayNameLabel", {
                    defaultValue: "显示名称",
                  })}
                </span>
                <span>
                  {t("providerForm.requestModelLabel", {
                    defaultValue: "实际请求模型",
                  })}
                </span>
                <span>
                  {t("providerForm.modelOneMHeader", {
                    defaultValue: "声明支持 1M",
                  })}
                </span>
              </div>

              {modelRoleRows.map((row) => {
                const usesOneM = hasClaudeOneMMarker(row.model);
                const baseModel = stripClaudeOneMMarker(row.model);
                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-1 gap-2 md:grid-cols-[120px_1fr_minmax(0,1fr)_104px]"
                  >
                    <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
                      {row.label}
                    </div>
                    {row.displayNameField ? (
                      <Input
                        value={row.displayName ?? ""}
                        onChange={(e) =>
                          onModelChange(row.displayNameField!, e.target.value)
                        }
                        placeholder={baseModel}
                        autoComplete="off"
                      />
                    ) : (
                      <div className="flex h-9 items-center px-1 text-sm text-muted-foreground">
                        {t("providerForm.modelNoDisplayName", {
                          defaultValue: "不显示在 /model 菜单",
                        })}
                      </div>
                    )}
                    {renderModelInput(
                      row.inputId,
                      baseModel,
                      row.modelField,
                      t("providerForm.modelPlaceholder", {
                        defaultValue: "",
                      }),
                      (value) => handleRoleModelChange(row, value),
                    )}
                    <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={usesOneM}
                        onCheckedChange={(checked) =>
                          handleRoleOneMChange(row, checked === true)
                        }
                      />
                      {t("providerForm.modelOneMLabel", {
                        defaultValue: "1M",
                      })}
                    </label>
                  </div>
                );
              })}
            </div>

            {/* 默认兜底模型 */}
            <div className="space-y-2 pt-3 border-t">
              <FormLabel htmlFor="claudeModel">
                {t("providerForm.fallbackModelLabel", {
                  defaultValue: "默认兜底模型",
                })}
              </FormLabel>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_minmax(0,104px)]">
                {renderModelInput(
                  "claudeModel",
                  stripClaudeOneMMarker(claudeModel),
                  "ANTHROPIC_MODEL",
                  t("providerForm.modelPlaceholder", { defaultValue: "" }),
                  handleFallbackModelChange,
                )}
                <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={fallbackUsesOneM}
                    onCheckedChange={(checked) =>
                      handleFallbackOneMChange(checked === true)
                    }
                  />
                  {t("providerForm.modelOneMLabel", { defaultValue: "1M" })}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("providerForm.fallbackModelHelp", {
                  defaultValue:
                    "用于未明确落到 Sonnet、Opus、Fable、Haiku 角色的请求。使用第三方/中转端点时建议填写：否则这些请求（含 Haiku 后台任务）会以原始 Claude 模型名透传给上游，可能因上游无此模型而报错。官方端点可留空。",
                })}
              </p>
            </div>

            {/* 自定义 User-Agent + 本地代理请求覆盖 */}
            {!isCopilotPreset && (
              <div className="space-y-4 pt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  {t("providerForm.routeOnlySettingsHint", {
                    defaultValue: "以下配置只在本地路由模式下生效。",
                  })}
                </p>
                <CustomUserAgentField
                  id="claude-custom-user-agent"
                  value={customUserAgent}
                  onChange={onCustomUserAgentChange}
                  help={t("providerForm.customUserAgentHelp", {
                    defaultValue:
                      "只在路由模式下生效，会替换转发到供应商 API 的请求里的 User-Agent。",
                  })}
                />
                <div className="pt-3 border-t">
                  <LocalProxyRequestOverridesField
                    headersJson={localProxyHeadersOverride}
                    bodyJson={localProxyBodyOverride}
                    onHeadersJsonChange={onLocalProxyHeadersOverrideChange}
                    onBodyJsonChange={onLocalProxyBodyOverrideChange}
                    help={t("providerForm.localProxyRequestOverridesHelp", {
                      defaultValue:
                        "只在路由模式下生效，作用于格式转换后的上游请求。",
                    })}
                  />
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 模型勾选弹窗：勾选后既是下拉框候选，也按顺序填入各模型角色 */}
      <ModelPickerDialog
        open={isModelPickerOpen}
        onOpenChange={setIsModelPickerOpen}
        models={fetchedModels}
        initialSelectedIds={pickerInitialSelectedIds}
        maxSelectable={modelRoleRows.length}
        onConfirm={handleModelPickerConfirm}
      />
    </>
  );
}
