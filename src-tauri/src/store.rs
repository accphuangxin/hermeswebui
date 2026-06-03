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
