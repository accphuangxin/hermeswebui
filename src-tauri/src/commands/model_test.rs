//! 模型可用性测试命令
//!
//! 供智能体供应商编辑界面校验单个模型是否真正可用。

use crate::services::model_test::{self, ModelTestResult};

/// 测试指定模型是否可用
///
/// 用表单当前填写的 baseURL / API Key 向 OpenAI 兼容的
/// `POST /v1/chat/completions` 发一次最小请求（`max_tokens: 1`）。
#[tauri::command(rename_all = "camelCase")]
pub async fn test_agent_provider_model(
    base_url: String,
    api_key: String,
    model: String,
) -> Result<ModelTestResult, String> {
    model_test::test_model(&base_url, &api_key, &model).await
}
