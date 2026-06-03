import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Settings,
  ArrowLeft,
  Minus,
  Maximize2,
  Minimize2,
  X,
  Book,
  Brain,
  Wrench,
  History,
  BarChart2,
  Download,
  FolderArchive,
  FolderOpen,
  KeyRound,
  Shield,
  Cpu,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Provider, VisibleApps } from "@/types";
import { useProvidersQuery, useSettingsQuery } from "@/lib/query";
import {
  providersApi,
  settingsApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/lib/api";
import { useProviderActions } from "@/hooks/useProviderActions";
import { openclawKeys, useOpenClawHealth } from "@/hooks/useOpenClaw";
import { hermesKeys, useOpenHermesWebUI } from "@/hooks/useHermes";
import { hermesApi } from "@/lib/api/hermes";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useAutoCompact } from "@/hooks/useAutoCompact";
import { useUsageCacheBridge } from "@/hooks/useUsageCacheBridge";
import { useLastValidValue } from "@/hooks/useLastValidValue";
import { extractErrorMessage } from "@/utils/errorUtils";
import { isTextEditableTarget } from "@/utils/domUtils";
import { cn } from "@/lib/utils";
import hermesBrandLogo from "@/assets/icons/hermes-brand.png";
import {
  isWindows,
  isLinux,
  DRAG_REGION_ATTR,
  DRAG_REGION_STYLE,
} from "@/lib/platform";
import { AppSwitcher } from "@/components/AppSwitcher";
import { ProviderList } from "@/components/providers/ProviderList";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { UpdateBadge } from "@/components/UpdateBadge";
import { ProxyToggle } from "@/components/proxy/ProxyToggle";
import { ClaudeDesktopRouteToggle } from "@/components/proxy/ClaudeDesktopRouteToggle";
import { FailoverToggle } from "@/components/proxy/FailoverToggle";
import UsageScriptModal from "@/components/UsageScriptModal";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel from "@/components/prompts/PromptPanel";
import UnifiedSkillsPanel from "@/components/skills/UnifiedSkillsPanel";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { FirstRunNoticeDialog } from "@/components/FirstRunNoticeDialog";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import { UniversalProviderPanel } from "@/components/universal";
import { McpIcon } from "@/components/BrandIcons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { SessionManagerPage } from "@/components/sessions/SessionManagerPage";
import {
  useDisableCurrentOmo,
  useDisableCurrentOmoSlim,
} from "@/lib/query/omo";
import WorkspaceFilesPanel from "@/components/workspace/WorkspaceFilesPanel";
import EnvPanel from "@/components/openclaw/EnvPanel";
import ToolsPanel from "@/components/openclaw/ToolsPanel";
import AgentsDefaultsPanel from "@/components/openclaw/AgentsDefaultsPanel";
import OpenClawHealthBanner from "@/components/openclaw/OpenClawHealthBanner";
import HermesMemoryPanel from "@/components/hermes/HermesMemoryPanel";
import { ChatPage } from "@/components/chat/ChatPage";
import { AgentsButton } from "@/components/chat/AgentsButton";
import { HermesAgentsPage } from "@/components/chat/HermesAgentsPage";
import { useChatStatus, useChatModels } from "@/hooks/useHermesChat";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wifi, WifiOff, Server } from "lucide-react";

type View =
  | "providers"
  | "settings"
  | "prompts"
  | "skills"
  | "mcp"
  | "agents"
  | "universal"
  | "sessions"
  | "workspace"
  | "openclawEnv"
  | "openclawTools"
  | "openclawAgents"
  | "hermesMemory"
  | "hermesChat"
  | "hermesAgents";

interface WebDavSyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

const DEFAULT_DRAG_BAR_HEIGHT = isWindows() || isLinux() ? 0 : 28; // px
const HEADER_HEIGHT = 64; // px

const STORAGE_KEY = "111hermes-last-app";
const VALID_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
];

const getInitialApp = (): AppId => {
  const saved = localStorage.getItem(STORAGE_KEY) as AppId | null;
  if (saved && VALID_APPS.includes(saved)) {
    return saved;
  }
  return "claude";
};

const VIEW_STORAGE_KEY = "111hermes-last-view";
const VALID_VIEWS: View[] = [
  "providers",
  "settings",
  "prompts",
  "skills",
  "mcp",
  "agents",
  "universal",
  "sessions",
  "workspace",
  "openclawEnv",
  "openclawTools",
  "openclawAgents",
  "hermesMemory",
  "hermesChat",
];

const getInitialView = (): View => {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
  if (saved && VALID_VIEWS.includes(saved)) {
    return saved;
  }
  return "hermesChat";
};

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeApp, setActiveApp] = useState<AppId>(getInitialApp);
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
    unifiedSkillsPanelRef.current?.scrollToTop();
  }, [currentView]);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState("general");
  const [settingsKey, setSettingsKey] = useState(0);
  const openSettings = useCallback((tab = "general") => {
    setSettingsDefaultTab(tab);
    setSettingsKey((k) => k + 1);
    setCurrentView("settings");
  }, []);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
  }, [currentView]);

  const { data: settingsData } = useSettingsQuery();

  // Hermes chat status & model selector (hoisted to title bar)
  const { data: hermesChatStatus } = useChatStatus(true);
  const { data: hermesChatModels = [] } = useChatModels();
  const [hermesSelectedModel, setHermesSelectedModel] = useState("");
  const [hermesSelectedAgentId, setHermesSelectedAgentId] = useState<string | null>(null);
  const [hermesSelectedAgentPort, setHermesSelectedAgentPort] = useState<number | null>(null);
  const prevApiHostRef = useRef<string>("");
  useEffect(() => {
    const host = hermesChatStatus?.host ?? "127.0.0.1";
    const hostChanged = prevApiHostRef.current !== "" && prevApiHostRef.current !== host;
    prevApiHostRef.current = host;

    if ((!hermesSelectedModel || hostChanged) && hermesChatModels.length > 0) {
      const def = hermesChatModels.find((m) => m.isDefault) ?? hermesChatModels[0];
      setHermesSelectedModel(`custom_${def.provider}:${def.id}`);
    }
  }, [hermesChatModels, hermesSelectedModel, hermesChatStatus]);

  // API Server quick-config popover state
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [apiConfigHost, setApiConfigHost] = useState("");
  const [apiConfigPort, setApiConfigPort] = useState("");
  const [apiConfigKey, setApiConfigKey] = useState("");
  useEffect(() => {
    if (apiConfigOpen) {
      invoke<{ host: string; port: number; key: string }>("getHermesApiServerConfig")
        .then((cfg) => {
          setApiConfigHost(cfg.host);
          setApiConfigPort(String(cfg.port));
          setApiConfigKey(cfg.key);
        })
        .catch(console.error);
    }
  }, [apiConfigOpen]);
  const handleApiConfigSave = async () => {
    try {
      await invoke("setHermesApiServerConfig", { host: apiConfigHost, port: apiConfigPort, key: apiConfigKey });
      setApiConfigOpen(false);
      setHermesSelectedModel(""); // reset model selection for new host
      void queryClient.invalidateQueries({ queryKey: ["hermesChat", "status"] });
      void queryClient.invalidateQueries({ queryKey: ["hermesChat", "models"] });
      toast.success(t("hermes.serverConfig.saved", { defaultValue: "连接配置已保存" }));
    } catch (e) {
      toast.error(t("hermes.serverConfig.saveFailed", { defaultValue: "保存失败" }), { description: String(e) });
    }
  };

  const useAppWindowControls =
    isLinux() && (settingsData?.useAppWindowControls ?? false);
  const dragBarHeight = useAppWindowControls ? 32 : DEFAULT_DRAG_BAR_HEIGHT;
  const contentTopOffset = dragBarHeight + HEADER_HEIGHT;
  const visibleApps: VisibleApps = settingsData?.visibleApps ?? {
    claude: true,
    "claude-desktop": true,
    codex: true,
    gemini: true,
    opencode: true,
    openclaw: true,
    hermes: true,
  };

  const getFirstVisibleApp = (): AppId => {
    if (visibleApps.claude) return "claude";
    if (visibleApps["claude-desktop"]) return "claude-desktop";
    if (visibleApps.codex) return "codex";
    if (visibleApps.gemini) return "gemini";
    if (visibleApps.opencode) return "opencode";
    if (visibleApps.openclaw) return "openclaw";
    if (visibleApps.hermes) return "hermes";
    return "claude"; // fallback
  };

  useEffect(() => {
    if (!visibleApps[activeApp]) {
      setActiveApp(getFirstVisibleApp());
    }
  }, [visibleApps, activeApp]);

  // Fallback from sessions view when switching to an app without session support
  useEffect(() => {
    if (
      currentView === "sessions" &&
      activeApp !== "claude" &&
      activeApp !== "codex" &&
      activeApp !== "opencode" &&
      activeApp !== "openclaw" &&
      activeApp !== "gemini" &&
      activeApp !== "hermes"
    ) {
      setCurrentView("providers");
    }
  }, [activeApp, currentView]);

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [usageProvider, setUsageProvider] = useState<Provider | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    provider: Provider;
    action: "remove" | "delete";
  } | null>(null);
  const effectiveEditingProvider = useLastValidValue(editingProvider);
  const effectiveUsageProvider = useLastValidValue(usageProvider);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const isToolbarCompact = useAutoCompact(toolbarRef);

  useUsageCacheBridge();

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const unifiedSkillsPanelRef = useRef<any>(null);
  const addActionButtonClass =
    "bg-orange-500 hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 dark:shadow-orange-500/40 rounded-full w-8 h-8";

  const {
    isRunning: isProxyRunning,
    takeoverStatus,
    status: proxyStatus,
  } = useProxyStatus();
  const isCurrentAppTakeoverActive = takeoverStatus?.[activeApp] || false;
  const activeProviderId = useMemo(() => {
    const target = proxyStatus?.active_targets?.find(
      (t) => t.app_type === activeApp,
    );
    return target?.provider_id;
  }, [proxyStatus?.active_targets, activeApp]);

  const { data, isLoading, refetch } = useProvidersQuery(activeApp, {
    isProxyRunning,
  });
  const providers = useMemo(() => data?.providers ?? {}, [data]);
  const currentProviderId = data?.currentProviderId ?? "";
  const isOpenClawView =
    activeApp === "openclaw" &&
    (currentView === "providers" ||
      currentView === "workspace" ||
      currentView === "sessions" ||
      currentView === "openclawEnv" ||
      currentView === "openclawTools" ||
      currentView === "openclawAgents");
  const { data: openclawHealthWarnings = [] } =
    useOpenClawHealth(isOpenClawView);
  const hasSkillsSupport = activeApp !== "claude-desktop";
  const hasSessionSupport =
    activeApp === "claude" ||
    activeApp === "codex" ||
    activeApp === "opencode" ||
    activeApp === "openclaw" ||
    activeApp === "gemini" ||
    activeApp === "hermes";

  const {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    saveUsageScript,
    setAsDefaultModel,
  } = useProviderActions(
    activeApp,
    isProxyRunning,
    isProxyRunning && isCurrentAppTakeoverActive,
  );

  const disableOmoMutation = useDisableCurrentOmo();
  const handleDisableOmo = () => {
    disableOmoMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  const disableOmoSlimMutation = useDisableCurrentOmoSlim();
  const handleDisableOmoSlim = () => {
    disableOmoSlimMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unsubscribe = await providersApi.onSwitched(
          async (event: ProviderSwitchEvent) => {
            if (event.appType === activeApp) {
              await refetch();
            }
          },
        );
      } catch (error) {
        console.error("[App] Failed to subscribe provider switch event", error);
      }
    };

    setupListener();
    return () => {
      unsubscribe?.();
    };
  }, [activeApp, refetch]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unsubscribe = await listen("universal-provider-synced", async () => {
          await queryClient.invalidateQueries({ queryKey: ["providers"] });
          try {
            await providersApi.updateTrayMenu();
          } catch (error) {
            console.error("[App] Failed to update tray menu", error);
          }
        });
      } catch (error) {
        console.error(
          "[App] Failed to subscribe universal-provider-synced event",
          error,
        );
      }
    };

    setupListener();
    return () => {
      unsubscribe?.();
    };
  }, [queryClient]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setupListener = async () => {
      try {
        const off = await listen(
          "webdav-sync-status-updated",
          async (event) => {
            const payload = (event.payload ??
              {}) as WebDavSyncStatusUpdatedPayload;
            await queryClient.invalidateQueries({ queryKey: ["settings"] });

            if (payload.source !== "auto" || payload.status !== "error") {
              return;
            }

            toast.error(
              t("settings.webdavSync.autoSyncFailedToast", {
                error: payload.error || t("common.unknown"),
              }),
            );
          },
        );
        if (!active) {
          off();
          return;
        }
        unsubscribe = off;
      } catch (error) {
        console.error(
          "[App] Failed to subscribe webdav-sync-status-updated event",
          error,
        );
      }
    };

    void setupListener();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [queryClient, t]);

  // Listen for proxy-official-warning: warn when takeover is enabled with an official provider
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      unsubscribe = await listen("proxy-official-warning", (event) => {
        const { providerName } = event.payload as {
          appType: string;
          providerName: string;
        };
        toast.warning(
          t("notifications.proxyOfficialWarning", {
            name: providerName,
            defaultValue: `当前供应商 ${providerName} 是官方供应商，建议切换到第三方供应商后再使用代理接管`,
          }),
          { duration: 8000 },
        );
      });
    };

    void setup();
    return () => {
      unsubscribe?.();
    };
  }, [t]);

  useEffect(() => {
    let active = true;
    let unlistenResize: (() => void) | undefined;

    const setupWindowStateSync = async () => {
      try {
        const currentWindow = getCurrentWindow();
        const syncWindowMaximizedState = async () => {
          const maximized = await currentWindow.isMaximized();
          if (active) {
            setIsWindowMaximized(maximized);
          }
        };

        await syncWindowMaximizedState();
        unlistenResize = await currentWindow.onResized(() => {
          void syncWindowMaximizedState();
        });
      } catch (error) {
        console.error("[App] Failed to sync window maximized state", error);
      }
    };

    void setupWindowStateSync();
    return () => {
      active = false;
      unlistenResize?.();
    };
  }, []);

  useEffect(() => {
    // settingsData 未加载时跳过，避免用 fallback false 覆盖 Rust 侧已设好的装饰状态
    if (!settingsData) return;

    const syncWindowDecorations = async () => {
      try {
        await getCurrentWindow().setDecorations(!useAppWindowControls);
      } catch (error) {
        console.error("[App] Failed to update window decorations", error);
      }
    };

    void syncWindowDecorations();
  }, [useAppWindowControls, settingsData]);


  useEffect(() => {
    const checkMigration = async () => {
      try {
        const migrated = await invoke<boolean>("get_migration_result");
        if (migrated) {
          toast.success(
            t("migration.success", { defaultValue: "配置迁移成功" }),
            { closeButton: true },
          );
        }
      } catch (error) {
        console.error("[App] Failed to check migration result:", error);
      }
    };

    checkMigration();
  }, [t]);

  useEffect(() => {
    const checkSkillsMigration = async () => {
      try {
        const result = await invoke<{ count: number; error?: string } | null>(
          "get_skills_migration_result",
        );
        if (result?.error) {
          toast.error(t("migration.skillsFailed"), {
            description: t("migration.skillsFailedDescription"),
            closeButton: true,
          });
          console.error("[App] Skills SSOT migration failed:", result.error);
          return;
        }
        if (result && result.count > 0) {
          toast.success(t("migration.skillsSuccess", { count: result.count }), {
            closeButton: true,
          });
          await queryClient.invalidateQueries({ queryKey: ["skills"] });
        }
      } catch (error) {
        console.error("[App] Failed to check skills migration result:", error);
      }
    };

    checkSkillsMigration();
  }, [t, queryClient]);


  const currentViewRef = useRef(currentView);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openSettings();
        return;
      }

      if (event.key !== "Escape" || event.defaultPrevented) return;

      if (document.body.style.overflow === "hidden") return;

      const view = currentViewRef.current;
      if (view === "hermesChat") return;

      if (isTextEditableTarget(event.target)) return;

      event.preventDefault();
      setCurrentView("hermesChat");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [launchDashboardOpen, setLaunchDashboardOpen] = useState(false);
  const openHermesWebUI = useOpenHermesWebUI(() =>
    setLaunchDashboardOpen(true),
  );

  const handleOpenWebsite = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
    } catch (error) {
      const detail =
        extractErrorMessage(error) ||
        t("notifications.openLinkFailed", {
          defaultValue: "链接打开失败",
        });
      toast.error(detail);
    }
  };

  const handleEditProvider = async ({
    provider,
    originalId,
  }: {
    provider: Provider;
    originalId?: string;
  }) => {
    await updateProvider(provider, originalId);
    setEditingProvider(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { provider, action } = confirmAction;

    if (action === "remove") {
      // Remove from live config only (for additive mode apps like OpenCode/OpenClaw)
      // Does NOT delete from database - provider remains in the list
      await providersApi.removeFromLiveConfig(provider.id, activeApp);
      // Invalidate queries to refresh the isInConfig state
      if (activeApp === "opencode") {
        await queryClient.invalidateQueries({
          queryKey: ["opencodeLiveProviderIds"],
        });
      } else if (activeApp === "openclaw") {
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.liveProviderIds,
        });
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.health,
        });
      } else if (activeApp === "hermes") {
        await queryClient.invalidateQueries({
          queryKey: hermesKeys.liveProviderIds,
        });
      }
      toast.success(
        t("notifications.removeFromConfigSuccess", {
          defaultValue: "已从配置移除",
        }),
        { closeButton: true },
      );
    } else {
      await deleteProvider(provider.id);
    }
    setConfirmAction(null);
  };

  const generateUniqueProviderCopyKey = (
    originalKey: string,
    existingKeys: string[],
  ): string => {
    const baseKey = `${originalKey}-copy`;

    if (!existingKeys.includes(baseKey)) {
      return baseKey;
    }

    let counter = 2;
    while (existingKeys.includes(`${baseKey}-${counter}`)) {
      counter++;
    }
    return `${baseKey}-${counter}`;
  };

  const handleDuplicateProvider = async (provider: Provider) => {
    const newSortIndex =
      provider.sortIndex !== undefined ? provider.sortIndex + 1 : undefined;

    const duplicatedProvider: Omit<Provider, "id" | "createdAt"> & {
      providerKey?: string;
      addToLive?: boolean;
    } = {
      name: `${provider.name} copy`,
      settingsConfig: JSON.parse(JSON.stringify(provider.settingsConfig)), // 深拷贝
      websiteUrl: provider.websiteUrl,
      category: provider.category,
      sortIndex: newSortIndex, // 复制原 sortIndex + 1
      meta: provider.meta
        ? JSON.parse(JSON.stringify(provider.meta))
        : undefined, // 深拷贝
      icon: provider.icon,
      iconColor: provider.iconColor,
    };

    if (
      activeApp === "opencode" ||
      activeApp === "openclaw" ||
      activeApp === "hermes"
    ) {
      let liveProviderIds: string[] = [];
      try {
        liveProviderIds =
          activeApp === "opencode"
            ? await queryClient.ensureQueryData({
                queryKey: ["opencodeLiveProviderIds"],
                queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
              })
            : activeApp === "openclaw"
              ? await queryClient.ensureQueryData({
                  queryKey: openclawKeys.liveProviderIds,
                  queryFn: () => providersApi.getOpenClawLiveProviderIds(),
                })
              : await queryClient.ensureQueryData({
                  queryKey: hermesKeys.liveProviderIds,
                  queryFn: () => providersApi.getHermesLiveProviderIds(),
                });
      } catch (error) {
        console.error(
          "[App] Failed to load live provider IDs for duplication",
          error,
        );
        const errorMessage = extractErrorMessage(error);
        toast.error(
          t("provider.duplicateLiveIdsLoadFailed", {
            defaultValue: "读取配置中的供应商标识失败，请先修复配置后再试",
          }) + (errorMessage ? `: ${errorMessage}` : ""),
        );
        return;
      }
      const existingKeys = Array.from(
        new Set([...Object.keys(providers), ...liveProviderIds]),
      );
      duplicatedProvider.providerKey = generateUniqueProviderCopyKey(
        provider.id,
        existingKeys,
      );
      duplicatedProvider.addToLive = false;
    }

    if (provider.sortIndex !== undefined) {
      const updates = Object.values(providers)
        .filter(
          (p) =>
            p.sortIndex !== undefined &&
            p.sortIndex >= newSortIndex! &&
            p.id !== provider.id,
        )
        .map((p) => ({
          id: p.id,
          sortIndex: p.sortIndex! + 1,
        }));

      if (updates.length > 0) {
        try {
          await providersApi.updateSortOrder(updates, activeApp);
        } catch (error) {
          console.error("[App] Failed to update sort order", error);
          toast.error(
            t("provider.sortUpdateFailed", {
              defaultValue: "排序更新失败",
            }),
          );
          return; // 如果排序更新失败，不继续添加
        }
      }
    }

    await addProvider(duplicatedProvider);
  };

  const handleOpenTerminal = async (provider: Provider) => {
    try {
      const selectedDir = await settingsApi.pickDirectory();
      if (!selectedDir) {
        return;
      }

      await providersApi.openTerminal(provider.id, activeApp, {
        cwd: selectedDir,
      });
      toast.success(
        t("provider.terminalOpened", {
          defaultValue: "终端已打开",
        }),
      );
    } catch (error) {
      console.error("[App] Failed to open terminal", error);
      const errorMessage = extractErrorMessage(error);
      toast.error(
        t("provider.terminalOpenFailed", {
          defaultValue: "打开终端失败",
        }) + (errorMessage ? `: ${errorMessage}` : ""),
      );
    }
  };

  const handleImportSuccess = async () => {
    try {
      await queryClient.invalidateQueries({
        queryKey: ["providers"],
        refetchType: "all",
      });
      await queryClient.refetchQueries({
        queryKey: ["providers"],
        type: "all",
      });
    } catch (error) {
      console.error("[App] Failed to refresh providers after import", error);
      await refetch();
    }
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to refresh tray menu", error);
    }
  };

  const notifyWindowControlError = (error: unknown) => {
    toast.error(
      t("notifications.windowControlFailed", {
        defaultValue: "窗口控制失败：{{error}}",
        error: extractErrorMessage(error),
      }),
    );
  };

  const handleWindowMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("[App] Failed to minimize window", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowToggleMaximize = async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.toggleMaximize();
      setIsWindowMaximized(await currentWindow.isMaximized());
    } catch (error) {
      console.error("[App] Failed to toggle maximize", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("[App] Failed to close window", error);
      notifyWindowControlError(error);
    }
  };

  const renderContent = () => {
    const isHermesView = currentView === "hermesChat" || currentView === "skills" || currentView === "hermesAgents";

    const content = (() => {
      switch (currentView) {
        case "settings":
          return (
            <SettingsPage
              key={settingsKey}
              open={true}
              onOpenChange={() => setCurrentView("hermesChat")}
              onImportSuccess={handleImportSuccess}
              defaultTab={settingsDefaultTab}
            />
          );
        case "prompts":
          return (
            <PromptPanel
              ref={promptPanelRef}
              open={true}
              onOpenChange={() => setCurrentView("hermesChat")}
              appId={activeApp}
            />
          );
        case "hermesMemory":
          return <HermesMemoryPanel />;
        case "mcp":
          return (
            <UnifiedMcpPanel
              ref={mcpPanelRef}
              onOpenChange={() => setCurrentView("hermesChat")}
            />
          );
        case "agents":
          return (
            <AgentsPanel onOpenChange={() => setCurrentView("hermesChat")} />
          );
        case "universal":
          return (
            <div className="px-6 pt-4">
              <UniversalProviderPanel />
            </div>
          );

        case "sessions":
          return <SessionManagerPage key={activeApp} appId={activeApp} />;
        case "workspace":
          return <WorkspaceFilesPanel />;
        case "openclawEnv":
          return <EnvPanel />;
        case "openclawTools":
          return <ToolsPanel />;
        case "openclawAgents":
          return <AgentsDefaultsPanel />;
        default:
          return (
            <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div ref={mainScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-12 px-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeApp}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <ProviderList
                      providers={providers}
                      currentProviderId={currentProviderId}
                      appId={activeApp}
                      isLoading={isLoading}
                      isProxyRunning={isProxyRunning}
                      isProxyTakeover={
                        isProxyRunning && isCurrentAppTakeoverActive
                      }
                      activeProviderId={activeProviderId}
                      onSwitch={switchProvider}
                      onEdit={(provider) => {
                        setEditingProvider(provider);
                      }}
                      onDelete={(provider) =>
                        setConfirmAction({ provider, action: "delete" })
                      }
                      onRemoveFromConfig={
                        activeApp === "opencode" ||
                        activeApp === "openclaw" ||
                        activeApp === "hermes"
                          ? (provider) =>
                              setConfirmAction({ provider, action: "remove" })
                          : undefined
                      }
                      onDisableOmo={
                        activeApp === "opencode" ? handleDisableOmo : undefined
                      }
                      onDisableOmoSlim={
                        activeApp === "opencode"
                          ? handleDisableOmoSlim
                          : undefined
                      }
                      onDuplicate={handleDuplicateProvider}
                      onConfigureUsage={setUsageProvider}
                      onOpenWebsite={handleOpenWebsite}
                      onOpenTerminal={
                        activeApp === "claude" ? handleOpenTerminal : undefined
                      }
                      onCreate={() => setIsAddOpen(true)}
                      onSetAsDefault={
                        activeApp === "openclaw"
                          ? setAsDefaultModel
                          : activeApp === "hermes"
                            ? switchProvider
                            : undefined
                      }
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          );
      }
    })();

    return (
      <>
        {/* Always-mounted hermes views — hidden via CSS to preserve streaming state */}
        <div className={cn("flex-1 min-h-0 overflow-hidden", !isHermesView && "hidden")}>
          <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden h-full", currentView !== "hermesChat" && "hidden")}>
            <ChatPage selectedModel={hermesSelectedModel} selectedAgentId={hermesSelectedAgentId} selectedAgentPort={hermesSelectedAgentPort} />
          </div>
          <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden h-full", currentView !== "skills" && "hidden")}>
            <UnifiedSkillsPanel
              ref={unifiedSkillsPanelRef}
              onOpenDiscovery={() => setCurrentView("skills")}
              currentApp={activeApp === "openclaw" ? "claude" : activeApp}
            />
          </div>
          <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden h-full", currentView !== "hermesAgents" && "hidden")}>
            <HermesAgentsPage
              isOnline={hermesChatStatus?.online ?? false}
              selectedAgentId={hermesSelectedAgentId}
              onSelectAgent={(id, port) => {
                setHermesSelectedAgentId(id);
                setHermesSelectedAgentPort(port ?? null);
              }}
              onBack={() => setCurrentView("hermesChat")}
            />
          </div>
        </div>
        {/* All other views — normal switch-based rendering with animation */}
        {!isHermesView && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              className="flex-1 min-h-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        )}
      </>
    );
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background text-foreground pb-4"
      style={{ overflowX: "hidden", paddingTop: contentTopOffset }}
    >
      {(dragBarHeight > 0 || useAppWindowControls) && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-end px-2"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag", height: dragBarHeight } as any}
        >
          {useAppWindowControls && (
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowMinimize()}
                title={t("header.windowMinimize")}
                className="h-7 w-7"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowToggleMaximize()}
                title={
                  isWindowMaximized
                    ? t("header.windowRestore")
                    : t("header.windowMaximize")
                }
                className="h-7 w-7"
              >
                {isWindowMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowClose()}
                title={t("header.windowClose")}
                className="h-7 w-7 hover:bg-red-500/15 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <header
        className="fixed z-50 w-full transition-all duration-300 bg-background/80 backdrop-blur-md"
        {...DRAG_REGION_ATTR}
        style={
          {
            ...DRAG_REGION_STYLE,
            top: dragBarHeight,
            height: HEADER_HEIGHT,
          } as any
        }
      >
        <div
          className="flex h-full items-center justify-between gap-2 px-6"
          {...DRAG_REGION_ATTR}
          style={{ ...DRAG_REGION_STYLE } as any}
        >
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: "no-drag" } as any}
          >
            {currentView === "hermesAgents" ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentView("hermesChat")}
                  className="hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Users className="w-4 h-4 text-muted-foreground" />
                <h1 className="text-sm font-semibold">
                  {t("hermes.agents.title", { defaultValue: "选择智能体" })}
                </h1>
              </div>
            ) : currentView === "hermesChat" ? (
              <div className="flex items-center gap-2">
                <div className="relative inline-flex items-center shrink-0">
                  <img
                    src={hermesBrandLogo}
                    alt="Hermes"
                    className="h-12 w-auto object-contain"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentView("providers")}
                  title={t("common.settings")}
                  className="hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentView("skills")}
                  title={t("skills.title", { defaultValue: "Skills 管理" })}
                  className="hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                <AgentsButton
                  isActive={false}
                  onClick={() => setCurrentView("hermesAgents")}
                />
                <UpdateBadge onClick={() => openSettings("general")} />
              </div>
            ) : currentView !== "providers" ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentView("hermesChat")}
                  className="mr-2 rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-lg font-semibold">
                  {currentView === "settings" && t("settings.title")}
                  {currentView === "prompts" &&
                    t("prompts.title", { appName: t(`apps.${activeApp}`) })}
                  {currentView === "skills" && t("skills.title")}
                  {currentView === "mcp" && t("mcp.unifiedPanel.title")}
                  {currentView === "agents" && t("agents.title")}
                  {currentView === "universal" &&
                    t("universalProvider.title", {
                      defaultValue: "统一供应商",
                    })}
                  {currentView === "sessions" && t("sessionManager.title")}
                  {currentView === "workspace" && t("workspace.title")}
                  {currentView === "openclawEnv" && t("openclaw.env.title")}
                  {currentView === "openclawTools" && t("openclaw.tools.title")}
                  {currentView === "openclawAgents" &&
                    t("openclaw.agents.title")}
                  {currentView === "hermesMemory" && t("hermes.memory.title")}
                </h1>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentView("hermesChat")}
                  className="mr-2 rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="relative inline-flex items-center">
                  <span
                    className={cn(
                      "text-xl font-semibold",
                      isProxyRunning && isCurrentAppTakeoverActive
                        ? "text-emerald-500 dark:text-emerald-400"
                        : "text-blue-500 dark:text-blue-400",
                    )}
                  >
                    111 Hermes
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    openSettings("general");
                  }}
                  title={t("common.settings")}
                  className="hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <UpdateBadge
                  onClick={() => {
                    openSettings("general");
                  }}
                />
                {isCurrentAppTakeoverActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      openSettings("usage");
                    }}
                    title={t("usage.title", {
                      defaultValue: "使用统计",
                    })}
                    className="hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <BarChart2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-1 min-w-0 items-center justify-end gap-1.5">
            {currentView === "providers" &&
              activeApp !== "opencode" &&
              activeApp !== "openclaw" &&
              activeApp !== "hermes" && (
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  {activeApp === "claude-desktop" ? (
                    <ClaudeDesktopRouteToggle />
                  ) : (
                    settingsData?.enableLocalProxy && (
                      <ProxyToggle activeApp={activeApp} />
                    )
                  )}
                  {activeApp !== "claude-desktop" &&
                    settingsData?.enableFailoverToggle && (
                      <FailoverToggle activeApp={activeApp} />
                    )}
                </div>
              )}
            <div
              ref={toolbarRef}
              className="flex flex-1 min-w-0 overflow-x-hidden items-center py-4 pr-2"
            >
              <div
                className="flex shrink-0 items-center gap-1.5 ml-auto"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                {currentView === "hermesChat" && (
                  <>
                    <Popover open={apiConfigOpen} onOpenChange={setApiConfigOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 hover:bg-black/5 dark:hover:bg-white/5"
                          title={t("hermes.serverConfig.title", { defaultValue: "API Server 配置" })}
                        >
                          <Server className="w-3.5 h-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3" align="end">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium">{t("hermes.serverConfig.title", { defaultValue: "API Server 配置" })}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Host</label>
                              <Input
                                value={apiConfigHost}
                                onChange={(e) => setApiConfigHost(e.target.value)}
                                placeholder="127.0.0.1"
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Port</label>
                              <Input
                                value={apiConfigPort}
                                onChange={(e) => setApiConfigPort(e.target.value)}
                                placeholder="8643"
                                className="h-7 text-xs"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">API Key</label>
                            <Input
                              type="password"
                              value={apiConfigKey}
                              onChange={(e) => setApiConfigKey(e.target.value)}
                              placeholder={t("hermes.serverConfig.keyPlaceholder", { defaultValue: "留空则不验证" })}
                              className="h-7 text-xs"
                              onKeyDown={(e) => { if (e.key === "Enter") void handleApiConfigSave(); }}
                            />
                          </div>
                          <Button size="sm" className="w-full h-7 text-xs" onClick={() => void handleApiConfigSave()}>
                            {t("common.save", { defaultValue: "保存" })}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hermesChatStatus?.online ? (
                        <Wifi className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <WifiOff className="w-3.5 h-3.5 text-destructive" />
                      )}
                      <span className={cn("text-xs font-medium", hermesChatStatus?.online ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                        {hermesChatStatus?.online ? t("hermes.chat.connected") : t("hermes.chat.disconnected")}
                      </span>
                    </div>
                    <Select
                      value={hermesSelectedModel}
                      onValueChange={async (m) => {
                        setHermesSelectedModel(m);
                        const match = m.match(/^custom_([^:]+):(.+)$/);
                        if (match) {
                          const [, providerId, modelId] = match;
                          try {
                            await invoke("switchHermesModel", { modelId, providerId });
                            toast.success(t("hermes.chat.modelSwitched", { model: modelId, provider: providerId, defaultValue: `已切换到 ${modelId} (${providerId})` }));
                          } catch (e) {
                            toast.error(t("hermes.chat.modelSwitchFailed", { defaultValue: "模型切换失败" }), { description: String(e) });
                          }
                        }
                      }}
                      disabled={!hermesChatStatus?.online || hermesChatModels.length === 0}
                    >
                      <SelectTrigger className="h-7 w-[220px] text-xs">
                        <SelectValue placeholder={t("hermes.chat.selectModel")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__" className="text-xs">
                          <span>{t("hermes.chat.defaultModel", { defaultValue: "默认" })}</span>
                          <span className="ml-2 text-muted-foreground">{t("hermes.chat.defaultModelHint", { defaultValue: "(由服务端决定)" })}</span>
                        </SelectItem>
                        {hermesChatModels.map((m) => (
                          <SelectItem key={`${m.provider}/${m.id}`} value={`custom_${m.provider}:${m.id}`} className="text-xs">
                            <span>{m.id}</span>
                            <span className="ml-2 text-muted-foreground">({m.provider})</span>
                            {m.isDefault && <span className="ml-1.5 text-[10px] text-primary font-medium">●</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {currentView === "prompts" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => promptPanelRef.current?.openAdd()}
                    className="hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t("prompts.add")}
                  </Button>
                )}
                {currentView === "mcp" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => mcpPanelRef.current?.openImport()}
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("mcp.importExisting")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => mcpPanelRef.current?.openAdd()}
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t("mcp.addMcp")}
                    </Button>
                  </>
                )}
                {currentView === "skills" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        unifiedSkillsPanelRef.current?.openInstallFromZip()
                      }
                      className="hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <FolderArchive className="w-4 h-4 mr-2" />
                      {t("skills.installFromZip.button")}
                    </Button>
                  </>
                )}
                {currentView === "providers" && (
                  <>
                    <AppSwitcher
                      activeApp={activeApp}
                      onSwitch={setActiveApp}
                      visibleApps={visibleApps}
                      compact={isToolbarCompact}
                    />

                    <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={
                            activeApp === "openclaw"
                              ? "openclaw"
                              : activeApp === "hermes"
                                ? "hermes"
                                : "default"
                          }
                          className="flex items-center gap-1"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          {activeApp === "hermes" ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("hermesChat")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("hermes.chat.title")}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("skills")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("skills.manage")}
                              >
                                <Wrench className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("hermesMemory")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("hermes.memory.title")}
                              >
                                <Brain className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void openHermesWebUI()}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("hermes.webui.open")}
                              >
                                <LayoutDashboard className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("mcp")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("mcp.title")}
                              >
                                <McpIcon size={16} />
                              </Button>
                            </>
                          ) : activeApp === "openclaw" ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("workspace")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("workspace.manage")}
                              >
                                <FolderOpen className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("openclawEnv")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("openclaw.env.title")}
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("openclawTools")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("openclaw.tools.title")}
                              >
                                <Shield className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("openclawAgents")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("openclaw.agents.title")}
                              >
                                <Cpu className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("sessions")}
                                className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                title={t("sessionManager.title")}
                              >
                                <History className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("skills")}
                                className={cn(
                                  "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                                  "transition-all duration-200 ease-in-out overflow-hidden",
                                  hasSkillsSupport
                                    ? "opacity-100 w-8 scale-100 px-2"
                                    : "opacity-0 w-0 scale-75 pointer-events-none px-0 -ml-1",
                                )}
                                title={t("skills.manage")}
                              >
                                <Wrench className="flex-shrink-0 w-4 h-4" />
                              </Button>
                              {activeApp !== "claude-desktop" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCurrentView("prompts")}
                                  className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                  title={t("prompts.manage")}
                                >
                                  <Book className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentView("sessions")}
                                className={cn(
                                  "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                                  "transition-all duration-200 ease-in-out overflow-hidden",
                                  hasSessionSupport
                                    ? "opacity-100 w-8 scale-100 px-2"
                                    : "opacity-0 w-0 scale-75 pointer-events-none px-0 -ml-1",
                                )}
                                title={t("sessionManager.title")}
                              >
                                <History className="flex-shrink-0 w-4 h-4" />
                              </Button>
                              {activeApp !== "claude-desktop" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCurrentView("mcp")}
                                  className="text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 w-8 px-2"
                                  title={t("mcp.title")}
                                >
                                  <McpIcon size={16} />
                                </Button>
                              )}
                            </>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <Button
                      onClick={() => setIsAddOpen(true)}
                      size="icon"
                      className={`ml-2 ${addActionButtonClass}`}
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col overflow-y-auto animate-fade-in">
        {isOpenClawView && openclawHealthWarnings.length > 0 && (
          <OpenClawHealthBanner warnings={openclawHealthWarnings} />
        )}
        {renderContent()}
      </main>

      <AddProviderDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        appId={activeApp}
        onSubmit={addProvider}
      />

      <EditProviderDialog
        open={Boolean(editingProvider)}
        provider={effectiveEditingProvider}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
          }
        }}
        onSubmit={handleEditProvider}
        appId={activeApp}
        isProxyTakeover={isProxyRunning && isCurrentAppTakeoverActive}
      />

      {effectiveUsageProvider && (
        <UsageScriptModal
          key={effectiveUsageProvider.id}
          provider={effectiveUsageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => setUsageProvider(null)}
          onSave={(script) => {
            if (usageProvider) {
              void saveUsageScript(usageProvider, script);
            }
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={
          confirmAction?.action === "remove"
            ? t("confirm.removeProvider")
            : t("confirm.deleteProvider")
        }
        message={
          confirmAction
            ? confirmAction.action === "remove"
              ? t("confirm.removeProviderMessage", {
                  name: confirmAction.provider.name,
                })
              : t("confirm.deleteProviderMessage", {
                  name: confirmAction.provider.name,
                })
            : ""
        }
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        isOpen={launchDashboardOpen}
        title={t("hermes.webui.launchConfirmTitle")}
        message={t("hermes.webui.launchConfirmMessage")}
        confirmText={t("hermes.webui.launchConfirmAction")}
        variant="info"
        onConfirm={() => {
          setLaunchDashboardOpen(false);
          void (async () => {
            try {
              await hermesApi.launchDashboard();
              toast.success(t("hermes.webui.launching"));
            } catch (error) {
              toast.error(t("hermes.webui.launchFailed"), {
                description: extractErrorMessage(error) || undefined,
              });
            }
          })();
        }}
        onCancel={() => setLaunchDashboardOpen(false)}
      />

      <DeepLinkImportDialog />
      <FirstRunNoticeDialog />
    </div>
  );
}

export default App;
