use crate::database::Database;
use crate::services::{ProxyService, UsageCache};
use std::sync::{Arc, OnceLock, RwLock};

/// 全局 active Hermes agent id（独立于 AppState 以便 SkillService 无需传参访问）
static ACTIVE_HERMES_AGENT: OnceLock<RwLock<Option<String>>> = OnceLock::new();

fn agent_lock() -> &'static RwLock<Option<String>> {
    ACTIVE_HERMES_AGENT.get_or_init(|| RwLock::new(None))
}

pub fn get_active_hermes_agent() -> Option<String> {
    agent_lock().read().ok().and_then(|g| g.clone())
}

pub fn set_active_hermes_agent(agent_id: Option<String>) {
    if let Ok(mut w) = agent_lock().write() {
        *w = agent_id;
    }
}

/// 当前 active agent 的 port 和 key（从 agent 数据直接获取，优先级高于 .env）
#[derive(Clone, Default)]
pub struct ActiveAgentConfig {
    pub port: Option<u16>,
    pub key: Option<String>,
}

static ACTIVE_AGENT_CONFIG: OnceLock<RwLock<ActiveAgentConfig>> = OnceLock::new();

fn agent_config_lock() -> &'static RwLock<ActiveAgentConfig> {
    ACTIVE_AGENT_CONFIG.get_or_init(|| RwLock::new(ActiveAgentConfig::default()))
}

pub fn get_active_agent_config() -> ActiveAgentConfig {
    agent_config_lock().read().ok().map(|g| g.clone()).unwrap_or_default()
}

pub fn set_active_agent_config(port: Option<u16>, key: Option<String>) {
    if let Ok(mut w) = agent_config_lock().write() {
        *w = ActiveAgentConfig { port, key };
    }
}

/// 全局应用状态
pub struct AppState {
    pub db: Arc<Database>,
    pub proxy_service: ProxyService,
    pub usage_cache: Arc<UsageCache>,
}

impl AppState {
    /// 创建新的应用状态
    pub fn new(db: Arc<Database>) -> Self {
        let proxy_service = ProxyService::new(db.clone());

        Self {
            db,
            proxy_service,
            usage_cache: Arc::new(UsageCache::new()),
        }
    }
}
