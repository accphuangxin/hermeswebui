import { useState, useCallback, useEffect, useRef } from "react";

/** Claude Code 声明「支持 1M 上下文」时使用的模型名后缀 */
export const CLAUDE_ONE_M_MARKER = "[1M]";

/** Claude 模型相关的环境变量名（含显示名称与子代理模型） */
export type ClaudeModelEnvField =
  | "ANTHROPIC_MODEL"
  | "ANTHROPIC_DEFAULT_HAIKU_MODEL"
  | "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME"
  | "ANTHROPIC_DEFAULT_SONNET_MODEL"
  | "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME"
  | "ANTHROPIC_DEFAULT_OPUS_MODEL"
  | "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME"
  | "ANTHROPIC_DEFAULT_FABLE_MODEL"
  | "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME"
  | "CLAUDE_CODE_SUBAGENT_MODEL";

/** 模型名是否带 1M 声明后缀（大小写不敏感） */
export function hasClaudeOneMMarker(model: string): boolean {
  return model.trimEnd().toLowerCase().endsWith("[1m]");
}

/** 去掉模型名末尾的 1M 声明后缀 */
export function stripClaudeOneMMarker(model: string): string {
  const trimmedEnd = model.trimEnd();
  if (!trimmedEnd.toLowerCase().endsWith("[1m]")) return model;
  return trimmedEnd.slice(0, -CLAUDE_ONE_M_MARKER.length).trimEnd();
}

/** 按需追加 / 移除 1M 声明后缀 */
export function setClaudeOneMMarker(model: string, enabled: boolean): string {
  const base = stripClaudeOneMMarker(model).trim();
  if (!base) return "";
  return enabled ? `${base}${CLAUDE_ONE_M_MARKER}` : base;
}

interface UseModelStateProps {
  settingsConfig: string;
  onConfigChange: (config: string) => void;
}

type EnvRecord = Record<string, unknown>;

function readString(env: EnvRecord, key: string): string {
  return typeof env[key] === "string" ? (env[key] as string) : "";
}

/**
 * 从 settingsConfig 中解析模型相关配置。
 *
 * 兼容旧键：Haiku 缺失时回退到 ANTHROPIC_SMALL_FAST_MODEL。
 */
function parseModelsFromConfig(settingsConfig: string) {
  try {
    const cfg = settingsConfig ? JSON.parse(settingsConfig) : {};
    const env = (cfg?.env || {}) as EnvRecord;
    const model = readString(env, "ANTHROPIC_MODEL");
    const small = readString(env, "ANTHROPIC_SMALL_FAST_MODEL");
    const haiku =
      readString(env, "ANTHROPIC_DEFAULT_HAIKU_MODEL") || small || model;
    const sonnet =
      readString(env, "ANTHROPIC_DEFAULT_SONNET_MODEL") || model || small;
    const opus =
      readString(env, "ANTHROPIC_DEFAULT_OPUS_MODEL") || model || small;
    const fable =
      readString(env, "ANTHROPIC_DEFAULT_FABLE_MODEL") || model || small;
    const subagent = readString(env, "CLAUDE_CODE_SUBAGENT_MODEL");

    return {
      model,
      haiku,
      sonnet,
      opus,
      fable,
      subagent,
      haikuName: readString(env, "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME"),
      sonnetName: readString(env, "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME"),
      opusName: readString(env, "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME"),
      fableName: readString(env, "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME"),
    };
  } catch {
    return {
      model: "",
      haiku: "",
      sonnet: "",
      opus: "",
      fable: "",
      subagent: "",
      haikuName: "",
      sonnetName: "",
      opusName: "",
      fableName: "",
    };
  }
}

/**
 * 管理模型选择状态
 * 支持 ANTHROPIC_MODEL 和各类型默认模型（含显示名称 / 1M 声明 / 子代理模型）
 */
export function useModelState({
  settingsConfig,
  onConfigChange,
}: UseModelStateProps) {
  const initial = parseModelsFromConfig(settingsConfig);

  // Initialize state by parsing config directly (fixes edit mode backfill)
  const [claudeModel, setClaudeModel] = useState(() => initial.model);
  const [defaultHaikuModel, setDefaultHaikuModel] = useState(
    () => initial.haiku,
  );
  const [defaultSonnetModel, setDefaultSonnetModel] = useState(
    () => initial.sonnet,
  );
  const [defaultOpusModel, setDefaultOpusModel] = useState(() => initial.opus);
  const [defaultFableModel, setDefaultFableModel] = useState(
    () => initial.fable,
  );
  const [subagentModel, setSubagentModel] = useState(() => initial.subagent);
  const [defaultHaikuModelName, setDefaultHaikuModelName] = useState(
    () => initial.haikuName,
  );
  const [defaultSonnetModelName, setDefaultSonnetModelName] = useState(
    () => initial.sonnetName,
  );
  const [defaultOpusModelName, setDefaultOpusModelName] = useState(
    () => initial.opusName,
  );
  const [defaultFableModelName, setDefaultFableModelName] = useState(
    () => initial.fableName,
  );

  const isUserEditingRef = useRef(false);
  const lastConfigRef = useRef(settingsConfig);
  const latestConfigRef = useRef(settingsConfig);

  latestConfigRef.current = settingsConfig;

  // 仅在 settingsConfig 变化时同步一次（表单加载/切换预设时）
  useEffect(() => {
    if (lastConfigRef.current === settingsConfig) {
      return;
    }

    if (isUserEditingRef.current) {
      isUserEditingRef.current = false;
      lastConfigRef.current = settingsConfig;
      return;
    }

    lastConfigRef.current = settingsConfig;

    const parsed = parseModelsFromConfig(settingsConfig);
    setClaudeModel(parsed.model);
    setDefaultHaikuModel(parsed.haiku);
    setDefaultSonnetModel(parsed.sonnet);
    setDefaultOpusModel(parsed.opus);
    setDefaultFableModel(parsed.fable);
    setSubagentModel(parsed.subagent);
    setDefaultHaikuModelName(parsed.haikuName);
    setDefaultSonnetModelName(parsed.sonnetName);
    setDefaultOpusModelName(parsed.opusName);
    setDefaultFableModelName(parsed.fableName);
  }, [settingsConfig]);

  const handleModelChange = useCallback(
    (field: ClaudeModelEnvField, value: string) => {
      isUserEditingRef.current = true;

      switch (field) {
        case "ANTHROPIC_MODEL":
          setClaudeModel(value);
          break;
        case "ANTHROPIC_DEFAULT_HAIKU_MODEL":
          setDefaultHaikuModel(value);
          break;
        case "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME":
          setDefaultHaikuModelName(value);
          break;
        case "ANTHROPIC_DEFAULT_SONNET_MODEL":
          setDefaultSonnetModel(value);
          break;
        case "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME":
          setDefaultSonnetModelName(value);
          break;
        case "ANTHROPIC_DEFAULT_OPUS_MODEL":
          setDefaultOpusModel(value);
          break;
        case "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME":
          setDefaultOpusModelName(value);
          break;
        case "ANTHROPIC_DEFAULT_FABLE_MODEL":
          setDefaultFableModel(value);
          break;
        case "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME":
          setDefaultFableModelName(value);
          break;
        case "CLAUDE_CODE_SUBAGENT_MODEL":
          setSubagentModel(value);
          break;
      }

      try {
        const currentConfig = latestConfigRef.current
          ? JSON.parse(latestConfigRef.current)
          : { env: {} };
        if (!currentConfig.env) currentConfig.env = {};
        const env = currentConfig.env as EnvRecord;

        // 新键仅写入；旧键不再写入
        const trimmed = value.trim();
        if (trimmed) {
          env[field] = trimmed;
        } else {
          delete env[field];
        }
        // 删除旧键
        delete env["ANTHROPIC_SMALL_FAST_MODEL"];

        const updatedConfig = JSON.stringify(currentConfig, null, 2);
        latestConfigRef.current = updatedConfig;
        onConfigChange(updatedConfig);
      } catch (err) {
        console.error("Failed to update model config:", err);
      }
    },
    [onConfigChange],
  );

  return {
    claudeModel,
    setClaudeModel,
    defaultHaikuModel,
    setDefaultHaikuModel,
    defaultSonnetModel,
    setDefaultSonnetModel,
    defaultOpusModel,
    setDefaultOpusModel,
    defaultFableModel,
    setDefaultFableModel,
    subagentModel,
    setSubagentModel,
    defaultHaikuModelName,
    defaultSonnetModelName,
    defaultOpusModelName,
    defaultFableModelName,
    handleModelChange,
  };
}
