//! 模型映射模块
//!
//! 在请求转发前，根据 Provider 配置替换请求中的模型名称

use crate::provider::Provider;
use serde_json::Value;

/// 模型映射配置
pub struct ModelMapping {
    pub haiku_model: Option<String>,
    pub sonnet_model: Option<String>,
    pub opus_model: Option<String>,
    pub fable_model: Option<String>,
    pub subagent_model: Option<String>,
    pub default_model: Option<String>,
}

/// 去掉模型名末尾的 `[1M]` 声明后缀。
///
/// `[1M]` 是 Claude Code 的上下文能力声明，只对客户端有意义，
/// 不能透传给上游，否则上游会因模型名不存在而报错。
fn strip_one_m_marker(model: &str) -> String {
    let trimmed = model.trim_end();
    if trimmed.to_lowercase().ends_with("[1m]") {
        trimmed[..trimmed.len() - 4].trim_end().to_string()
    } else {
        model.to_string()
    }
}

impl ModelMapping {
    /// 从 Provider 配置中提取模型映射
    pub fn from_provider(provider: &Provider) -> Self {
        let env = provider.settings_config.get("env");

        Self {
            haiku_model: env
                .and_then(|e| e.get("ANTHROPIC_DEFAULT_HAIKU_MODEL"))
                .and_then(|v| v.as_str())
                .map(strip_one_m_marker)
                .filter(|s| !s.is_empty()),
            sonnet_model: env
                .and_then(|e| e.get("ANTHROPIC_DEFAULT_SONNET_MODEL"))
                .and_then(|v| v.as_str())
                .map(strip_one_m_marker)
                .filter(|s| !s.is_empty()),
            opus_model: env
                .and_then(|e| e.get("ANTHROPIC_DEFAULT_OPUS_MODEL"))
                .and_then(|v| v.as_str())
                .map(strip_one_m_marker)
                .filter(|s| !s.is_empty()),
            fable_model: env
                .and_then(|e| e.get("ANTHROPIC_DEFAULT_FABLE_MODEL"))
                .and_then(|v| v.as_str())
                .map(strip_one_m_marker)
                .filter(|s| !s.is_empty()),
            subagent_model: env
                .and_then(|e| e.get("CLAUDE_CODE_SUBAGENT_MODEL"))
                .and_then(|v| v.as_str())
                .map(strip_one_m_marker)
                .filter(|s| !s.is_empty()),
            default_model: env
                .and_then(|e| e.get("ANTHROPIC_MODEL"))
                .and_then(|v| v.as_str())
                .map(strip_one_m_marker)
                .filter(|s| !s.is_empty()),
        }
    }

    /// 检查是否配置了任何模型映射
    pub fn has_mapping(&self) -> bool {
        self.haiku_model.is_some()
            || self.sonnet_model.is_some()
            || self.opus_model.is_some()
            || self.fable_model.is_some()
            || self.subagent_model.is_some()
            || self.default_model.is_some()
    }

    /// 根据原始模型名称获取映射后的模型
    ///
    /// 优先级：Haiku / Opus / Sonnet / Fable 按角色匹配 → Subagent → 默认兜底模型。
    /// Fable 未单独配置时回退到 Opus 映射。
    pub fn map_model(&self, original_model: &str) -> String {
        // 客户端可能带 `[1M]` 声明，匹配与透传前都先去掉
        let base_model = strip_one_m_marker(original_model);
        let model_lower = base_model.to_lowercase();

        // 1. 按模型类型匹配
        if model_lower.contains("haiku") {
            if let Some(ref m) = self.haiku_model {
                return m.clone();
            }
        }
        if model_lower.contains("opus") {
            if let Some(ref m) = self.opus_model {
                return m.clone();
            }
        }
        if model_lower.contains("sonnet") {
            if let Some(ref m) = self.sonnet_model {
                return m.clone();
            }
        }
        if model_lower.contains("fable") {
            if let Some(m) = self.fable_model.as_ref().or(self.opus_model.as_ref()) {
                return m.clone();
            }
        }

        // 2. 子代理模型
        if let Some(ref m) = self.subagent_model {
            if base_model == *m {
                return m.clone();
            }
        }

        // 3. 默认模型
        if let Some(ref m) = self.default_model {
            return m.clone();
        }

        // 4. 无映射，保持原样（已去掉 1M 声明）
        base_model
    }
}

/// 对请求体应用模型映射
///
/// 无论是否配置映射，都会去掉模型名里的 `[1M]` 声明（该后缀只对客户端有意义）。
///
/// 返回 (映射后的请求体, 原始模型名, 映射后模型名)
pub fn apply_model_mapping(
    mut body: Value,
    provider: &Provider,
) -> (Value, Option<String>, Option<String>) {
    let mapping = ModelMapping::from_provider(provider);
    let original_model = body.get("model").and_then(|m| m.as_str()).map(String::from);

    let Some(original) = original_model else {
        return (body, None, None);
    };

    let mapped = if mapping.has_mapping() {
        mapping.map_model(&original)
    } else {
        strip_one_m_marker(&original)
    };

    if mapped != original {
        log::debug!("[ModelMapper] 模型映射: {original} → {mapped}");
        body["model"] = serde_json::json!(mapped);
        return (body, Some(original), Some(mapped));
    }

    (body, Some(original), None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn create_provider_with_mapping() -> Provider {
        Provider {
            id: "test".to_string(),
            name: "Test".to_string(),
            settings_config: json!({
                "env": {
                    "ANTHROPIC_MODEL": "default-model",
                    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "haiku-mapped",
                    "ANTHROPIC_DEFAULT_SONNET_MODEL": "sonnet-mapped",
                    "ANTHROPIC_DEFAULT_OPUS_MODEL": "opus-mapped"
                }
            }),
            website_url: None,
            category: None,
            created_at: None,
            sort_index: None,
            notes: None,
            meta: None,
            icon: None,
            icon_color: None,
            in_failover_queue: false,
        }
    }

    fn create_provider_without_mapping() -> Provider {
        Provider {
            id: "test".to_string(),
            name: "Test".to_string(),
            settings_config: json!({}),
            website_url: None,
            category: None,
            created_at: None,
            sort_index: None,
            notes: None,
            meta: None,
            icon: None,
            icon_color: None,
            in_failover_queue: false,
        }
    }

    #[test]
    fn test_sonnet_mapping() {
        let provider = create_provider_with_mapping();
        let body = json!({"model": "claude-sonnet-4-5-20250929"});
        let (result, original, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "sonnet-mapped");
        assert_eq!(original, Some("claude-sonnet-4-5-20250929".to_string()));
        assert_eq!(mapped, Some("sonnet-mapped".to_string()));
    }

    #[test]
    fn test_haiku_mapping() {
        let provider = create_provider_with_mapping();
        let body = json!({"model": "claude-haiku-4-5"});
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "haiku-mapped");
        assert_eq!(mapped, Some("haiku-mapped".to_string()));
    }

    #[test]
    fn test_opus_mapping() {
        let provider = create_provider_with_mapping();
        let body = json!({"model": "claude-opus-4-5"});
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "opus-mapped");
        assert_eq!(mapped, Some("opus-mapped".to_string()));
    }

    #[test]
    fn test_thinking_does_not_affect_model_mapping() {
        // Issue #2081: thinking 参数不应影响模型映射
        let provider = create_provider_with_mapping();
        let body = json!({
            "model": "claude-sonnet-4-5",
            "thinking": {"type": "enabled"}
        });
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "sonnet-mapped");
        assert_eq!(mapped, Some("sonnet-mapped".to_string()));
    }

    #[test]
    fn test_thinking_adaptive_does_not_affect_model_mapping() {
        // Issue #2081: adaptive thinking 也不应影响模型映射
        let provider = create_provider_with_mapping();
        let body = json!({
            "model": "claude-sonnet-4-5",
            "thinking": {"type": "adaptive"}
        });
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "sonnet-mapped");
        assert_eq!(mapped, Some("sonnet-mapped".to_string()));
    }

    #[test]
    fn test_thinking_disabled() {
        let provider = create_provider_with_mapping();
        let body = json!({
            "model": "claude-sonnet-4-5",
            "thinking": {"type": "disabled"}
        });
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "sonnet-mapped");
        assert_eq!(mapped, Some("sonnet-mapped".to_string()));
    }

    #[test]
    fn test_unknown_model_uses_default() {
        let provider = create_provider_with_mapping();
        let body = json!({"model": "some-unknown-model"});
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "default-model");
        assert_eq!(mapped, Some("default-model".to_string()));
    }

    #[test]
    fn test_no_mapping_configured() {
        let provider = create_provider_without_mapping();
        let body = json!({"model": "claude-sonnet-4-5"});
        let (result, original, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "claude-sonnet-4-5");
        assert_eq!(original, Some("claude-sonnet-4-5".to_string()));
        assert!(mapped.is_none());
    }

    #[test]
    fn test_case_insensitive() {
        let provider = create_provider_with_mapping();
        let body = json!({"model": "Claude-SONNET-4-5"});
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "sonnet-mapped");
        assert_eq!(mapped, Some("sonnet-mapped".to_string()));
    }

    #[test]
    fn test_one_m_marker_stripped_without_mapping() {
        let provider = create_provider_without_mapping();
        let body = json!({"model": "deepseek-chat [1M]"});
        let (result, _, mapped) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "deepseek-chat");
        assert_eq!(mapped, Some("deepseek-chat".to_string()));
    }

    #[test]
    fn test_one_m_marker_stripped_in_mapped_value() {
        let provider = Provider {
            id: "test".to_string(),
            name: "Test".to_string(),
            settings_config: json!({
                "env": { "ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-k3 [1M]" }
            }),
            website_url: None,
            category: None,
            created_at: None,
            sort_index: None,
            notes: None,
            meta: None,
            icon: None,
            icon_color: None,
            in_failover_queue: false,
        };
        let body = json!({"model": "claude-sonnet-4-6"});
        let (result, _, _) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "kimi-k3");
    }

    #[test]
    fn test_fable_mapping_falls_back_to_opus() {
        let provider = create_provider_with_mapping();
        let body = json!({"model": "claude-fable-5-1"});
        let (result, _, _) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "opus-mapped");
    }

    #[test]
    fn test_subagent_mapping() {
        let provider = Provider {
            id: "test".to_string(),
            name: "Test".to_string(),
            settings_config: json!({
                "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "deepseek-v4-flash" }
            }),
            website_url: None,
            category: None,
            created_at: None,
            sort_index: None,
            notes: None,
            meta: None,
            icon: None,
            icon_color: None,
            in_failover_queue: false,
        };
        let body = json!({"model": "deepseek-v4-flash [1M]"});
        let (result, _, _) = apply_model_mapping(body, &provider);
        assert_eq!(result["model"], "deepseek-v4-flash");
    }
}
