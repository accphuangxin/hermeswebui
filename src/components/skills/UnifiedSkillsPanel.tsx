import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Trash2,
  ExternalLink,
  RefreshCw,
  Loader2,
  Search,
  Star,
  Upload,
  Globe,
  Package,
  X,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  type ImportSkillSelection,
  type SkillBackupEntry,
  useDeleteSkillBackup,
  useInstalledSkills,
  useSkillBackups,
  useRestoreSkillBackup,
  useToggleSkillFavorite,
  useUninstallSkill,
  useScanUnmanagedSkills,
  useImportSkillsFromApps,
  useInstallSkillsFromZip,
  useCheckSkillUpdates,
  useUpdateSkill,
  useDiscoverableSkills,
  useInstallSkill,
  useSkillRepos,
  useAddSkillRepo,
  useRemoveSkillRepo,
  type InstalledSkill,
  type SkillUpdateInfo,
} from "@/hooks/useSkills";
import type { AppId } from "@/lib/api/types";
import type { SkillRepo } from "@/lib/api/skills";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { settingsApi, skillsApi } from "@/lib/api";
import { useHermesAgents } from "@/hooks/useHermesChat";
import { toast } from "sonner";
import { ListItemRow } from "@/components/common/ListItemRow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSkillError } from "@/lib/errors/skillErrorParser";
import { clawHubApi, localRepoApi, type ClawHubSkill } from "@/lib/api/clawhub";
import { RepoManagerPanel } from "./RepoManagerPanel";
import { cn } from "@/lib/utils";

interface UnifiedSkillsPanelProps {
  onOpenDiscovery: () => void;
  currentApp: AppId;
  agentId: string;
  onSelectAgent?: (agentId: string) => void;
}

export interface UnifiedSkillsPanelHandle {
  openDiscovery: () => void;
  openImport: () => void;
  openInstallFromZip: () => void;
  openRestoreFromBackup: () => void;
  checkUpdates: () => void;
  scrollToTop: () => void;
}

function formatSkillBackupDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return Number.isNaN(date.getTime()) ? String(unixSeconds) : date.toLocaleString();
}

// ─── ClawHub 浏览面板 ─────────────────────────────────────────────────────────

type BrowseTab = "clawhub" | "repos";
const CLAWHUB_PAGE_SIZE = 20;

interface BrowsePanelProps {
  installedKeys: Set<string>;
  onInstalled: () => void;
  agentId?: string | null;
}

function BrowsePanel({ installedKeys, onInstalled, agentId }: BrowsePanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<BrowseTab>("clawhub");
  const [searchInput, setSearchInput] = useState("");
  const [repoManagerOpen, setRepoManagerOpen] = useState(false);

  // ClawHub state
  const [clawHubSkills, setClawHubSkills] = useState<ClawHubSkill[]>([]);
  const [clawHubCursor, setClawHubCursor] = useState<string | undefined>();
  const [clawHubDone, setClawHubDone] = useState(false);
  const [clawHubLoading, setClawHubLoading] = useState(false);

  const { data: discoverableSkills, refetch: refetchDiscoverable } = useDiscoverableSkills();
  const { data: repos = [], refetch: refetchRepos } = useSkillRepos();
  const addRepoMutation = useAddSkillRepo();
  const removeRepoMutation = useRemoveSkillRepo();
  const installMutation = useInstallSkill();

  // tab "clawhub" = 局域网仓库 (wry-salmon-294), tab "repos" = ClawHub (wry-manatee-359)
  const apiForTab = tab === "clawhub" ? localRepoApi : clawHubApi;

  const loadClawHub = useCallback(async (reset?: boolean) => {
    if (clawHubLoading && !reset) return;
    setClawHubLoading(true);
    try {
      const cursor = reset ? undefined : clawHubCursor;
      const result = await apiForTab.listPublic({ cursor, numItems: CLAWHUB_PAGE_SIZE, sort: "downloads" });
      setClawHubSkills((prev) => reset ? result.skills : [...prev, ...result.skills]);
      setClawHubCursor(result.cursor);
      setClawHubDone(result.isDone);
    } catch (e) {
      toast.error(t("skills.clawhub.loadFailed", { defaultValue: "加载失败" }), { description: String(e) });
    } finally {
      setClawHubLoading(false);
    }
  }, [clawHubLoading, clawHubCursor, apiForTab, t]);

  const filteredClawHubSkills = clawHubSkills;

  // 服务端搜索，300ms 防抖
  useEffect(() => {
    const q = searchInput.trim();
    if (!q) {
      setClawHubSkills([]);
      setClawHubCursor(undefined);
      setClawHubDone(false);
      void loadClawHub(true);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setClawHubLoading(true);
      apiForTab.search(q, CLAWHUB_PAGE_SIZE).then((result) => {
        if (!cancelled) {
          setClawHubSkills(result.skills);
          setClawHubCursor(undefined);
          setClawHubDone(true);
        }
      }).catch((e) => {
        if (!cancelled) toast.error(t("skills.clawhub.loadFailed", { defaultValue: "搜索失败" }), { description: String(e) });
      }).finally(() => {
        if (!cancelled) setClawHubLoading(false);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, tab]);

  useEffect(() => {
    setClawHubSkills([]);
    setClawHubCursor(undefined);
    setClawHubDone(false);
    setSearchInput("");
    void loadClawHub(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const isInstalled = useCallback((repoOwner: string, repoName: string, directory: string): boolean => {
    const key = `${directory.toLowerCase()}:${repoOwner.toLowerCase()}:${repoName.toLowerCase()}`;
    return installedKeys.has(key) || installedKeys.has(`slug:${directory.toLowerCase()}`);
  }, [installedKeys]);

  const handleInstallClawHub = async (skill: ClawHubSkill) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const baseUrl = tab === "clawhub"
        ? "https://wry-salmon-294.convex.site"
        : "https://wry-manatee-359.convex.site";
      const url = `${baseUrl}/api/v1/download?slug=${encodeURIComponent(skill.slug)}`;
      await invoke("install_skill_from_url", { url, currentApp: "hermes" });
      const installPath = agentId
        ? `~/.hermes/profiles/${agentId}/skills/`
        : "~/.hermes/skills/";
      toast.success(t("skills.installSuccess", { name: skill.displayName || skill.slug }), {
        description: installPath,
        closeButton: true,
      });
      onInstalled();
    } catch (error) {
      const { title, description } = formatSkillError(error instanceof Error ? error.message : String(error), t, "skills.installFailed");
      toast.error(title, { description, duration: 10000 });
    }
  };

  const handleAddRepo = async (repo: SkillRepo) => {
    try {
      await addRepoMutation.mutateAsync(repo);
      const { data: freshSkills } = await refetchDiscoverable();
      const count = freshSkills?.filter((s) => s.repoOwner === repo.owner && s.repoName === repo.name).length ?? 0;
      toast.success(t("skills.repo.addSuccess", { owner: repo.owner, name: repo.name, count }), { closeButton: true });
    } catch (e) {
      toast.error(t("common.error"), { description: String(e) });
    }
  };

  const handleRemoveRepo = async (owner: string, name: string) => {
    try {
      await removeRepoMutation.mutateAsync({ owner, name });
      toast.success(t("skills.repo.removeSuccess", { owner, name }), { closeButton: true });
    } catch (e) {
      toast.error(t("common.error"), { description: String(e) });
    }
  };

  const repoSkillsWithInstalled = useMemo(() => {
    if (!discoverableSkills) return [];
    return discoverableSkills.map((d) => {
      const installName = d.directory.split(/[/\\]/).pop()?.toLowerCase() || d.directory.toLowerCase();
      const key = `${installName}:${d.repoOwner.toLowerCase()}:${d.repoName.toLowerCase()}`;
      return { ...d, installed: installedKeys.has(key) };
    });
  }, [discoverableSkills, installedKeys]);

  const hasMoreClawhub = !clawHubDone && !searchInput.trim();

  if (repoManagerOpen) {
    return (
      <RepoManagerPanel
        repos={repos}
        skills={repoSkillsWithInstalled}
        onAdd={handleAddRepo}
        onRemove={handleRemoveRepo}
        onClose={() => {
          setRepoManagerOpen(false);
          void refetchRepos();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b shrink-0">
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5 flex-1">
          <button
            type="button"
            onClick={() => setTab("clawhub")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              tab === "clawhub" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Package className="w-3 h-3" />
            {t("skills.searchSource.repos")}
          </button>
          <button
            type="button"
            onClick={() => setTab("repos")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              tab === "repos" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Globe className="w-3 h-3" />
            ClawHub
          </button>
        </div>
        {tab === "repos" && (
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setRepoManagerOpen(true)}>
            {t("skills.repoManager")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={clawHubLoading}
          onClick={() => {
            setClawHubSkills([]);
            setClawHubCursor(undefined);
            setClawHubDone(false);
            void loadClawHub(true);
          }}
          title={t("skills.reload", { defaultValue: "刷新" })}
        >
          {clawHubLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("skills.clawhub.searchPlaceholder", { defaultValue: "搜索技能..." })}
              className="pl-8 h-7 text-xs"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {clawHubLoading && (
            <div className="flex items-center px-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {tab === "clawhub" ? (
          clawHubLoading && clawHubSkills.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClawHubSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-sm text-muted-foreground">
              <Globe className="w-8 h-8 mb-2 opacity-30" />
              {t("skills.clawhub.empty", { defaultValue: "暂无技能" })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredClawHubSkills.map((skill) => {
                const installed = isInstalled(skill.repoOwner ?? "", skill.repoName ?? "", skill.repoName ?? skill.slug);
                return (
                  <ClawHubSkillRow
                    key={skill._id}
                    skill={skill}
                    installed={installed}
                    installing={installMutation.isPending && installMutation.variables?.skill?.repoName === skill.repoName}
                    onInstall={() => void handleInstallClawHub(skill)}
                  />
                );
              })}
              {hasMoreClawhub && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs text-muted-foreground"
                  disabled={clawHubLoading}
                  onClick={() => void loadClawHub()}
                >
                  {clawHubLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  {t("skills.skillssh.loadMore")}
                </Button>
              )}
            </div>
          )
        ) : (
          /* ClawHub tab — same rendering as 局域网仓库, just different API */
          clawHubLoading && clawHubSkills.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClawHubSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-sm text-muted-foreground">
              <Globe className="w-8 h-8 mb-2 opacity-30" />
              {t("skills.clawhub.empty", { defaultValue: "暂无技能" })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredClawHubSkills.map((skill) => {
                const installed = isInstalled(skill.repoOwner ?? "", skill.repoName ?? "", skill.repoName ?? skill.slug);
                return (
                  <ClawHubSkillRow
                    key={skill._id}
                    skill={skill}
                    installed={installed}
                    installing={installMutation.isPending && installMutation.variables?.skill?.repoName === skill.repoName}
                    onInstall={() => void handleInstallClawHub(skill)}
                  />
                );
              })}
              {hasMoreClawhub && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs text-muted-foreground"
                  disabled={clawHubLoading}
                  onClick={() => void loadClawHub()}
                >
                  {clawHubLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  {t("skills.skillssh.loadMore")}
                </Button>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── ClawHub skill row ────────────────────────────────────────────────────────

interface ClawHubSkillRowProps {
  skill: ClawHubSkill;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
}

function ClawHubSkillRow({ skill, installed, installing, onInstall }: ClawHubSkillRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn("rounded-lg border bg-card transition-colors group", expanded ? "bg-muted/20" : "hover:bg-muted/40")}>
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-xs text-foreground">{skill.displayName || skill.slug}</span>
            {skill.ownerHandle && (
              <span className="text-[10px] text-muted-foreground/60 shrink-0">@{skill.ownerHandle}</span>
            )}
            {typeof skill.stars === "number" && skill.stars > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-500 shrink-0">
                <Star className="w-2.5 h-2.5 fill-amber-500" />
                {skill.stars.toLocaleString()}
              </span>
            )}
            {typeof skill.installs === "number" && skill.installs > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                <Download className="w-2.5 h-2.5" />
                {skill.installs.toLocaleString()}
              </span>
            )}
            {skill.latestVersion && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 shrink-0 text-muted-foreground">
                v{skill.latestVersion}
              </Badge>
            )}
          </div>
          {!expanded && skill.description && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{skill.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {installed ? (
            <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-green-600/90 hover:bg-green-600 text-white border-0 shrink-0">
              {t("skills.installed")}
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 shrink-0"
              disabled={installing}
              onClick={onInstall}
            >
              {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : t("skills.install")}
            </Button>
          )}
        </div>
      </div>
      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50 mt-0 pt-2">
          {skill.description ? (
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{skill.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">{t("skills.noDescription")}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/60">
            <span>slug: {skill.slug}</span>
            {skill.latestVersion && <span>version: {skill.latestVersion}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Repo skill row ───────────────────────────────────────────────────────────


// ─── Publish to ClawHub dialog ────────────────────────────────────────────────

interface PublishDialogProps {
  skill: InstalledSkill;
  onClose: () => void;
}

function PublishDialog({ skill, onClose }: PublishDialogProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => localStorage.getItem("clawhub_token") ?? "");
  const [version, setVersion] = useState("1.0.0");
  const [changelog, setChangelog] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");

  const handlePublish = async () => {
    if (!token.trim()) {
      toast.error(t("skills.clawhub.tokenRequired", { defaultValue: "请输入 ClawHub API Token" }));
      return;
    }
    setPublishing(true);
    setPublishStatus(t("skills.clawhub.readingFiles", { defaultValue: "读取文件..." }));
    try {
      localStorage.setItem("clawhub_token", token.trim());

      const { invoke } = await import("@tauri-apps/api/core");
      setPublishStatus(t("skills.clawhub.readingFiles", { defaultValue: "读取文件..." }));
      const rawFiles = await invoke<Array<{
        path: string;
        contentBase64: string;
        size: number;
        contentType: string;
        sha256: string;
      }>>("read_skill_files", { directory: skill.directory });

      setPublishStatus(t("skills.clawhub.publishing", { defaultValue: "发布中..." }));
      await clawHubApi.publish({
        token: token.trim(),
        slug: skill.directory,
        displayName: skill.name,
        version,
        changelog: changelog || `Version ${version}`,
        files: rawFiles.map((f) => ({ path: f.path, contentBase64: f.contentBase64, contentType: f.contentType })),
      });
      toast.success(t("skills.clawhub.publishSuccess", { defaultValue: "发布成功！" }), { closeButton: true });
      onClose();
    } catch (e) {
      toast.error(t("skills.clawhub.publishFailed", { defaultValue: "发布失败" }), { description: String(e) });
    } finally {
      setPublishing(false);
      setPublishStatus("");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" zIndex="alert">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Upload className="w-5 h-5" />
            {t("skills.clawhub.publish", { defaultValue: "发布到 Local ClawHub" })}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {t("skills.clawhub.publishDescription", { defaultValue: "将技能 {{name}} 发布到 Local ClawHub", name: skill.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("skills.clawhub.apiToken", { defaultValue: "API Token" })}
            </label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("skills.clawhub.tokenPlaceholder", { defaultValue: "从 clawhub.ai 获取" })}
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input value={skill.directory} disabled className="h-9 bg-muted" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Version</label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("skills.clawhub.changelog", { defaultValue: "更新说明" })}
            </label>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder={t("skills.clawhub.changelogPlaceholder", { defaultValue: "描述此次发布的内容..." })}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={publishing}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handlePublish()} disabled={publishing}>
            {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {publishing
              ? (publishStatus || t("skills.clawhub.publishing", { defaultValue: "发布中..." }))
              : t("skills.clawhub.publish", { defaultValue: "发布到 Local ClawHub" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const UnifiedSkillsPanel = React.forwardRef<UnifiedSkillsPanelHandle, UnifiedSkillsPanelProps>(
  ({ onOpenDiscovery, currentApp, agentId, onSelectAgent }, ref) => {
    const { t } = useTranslation();
    const [confirmDialog, setConfirmDialog] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      confirmText?: string;
      variant?: "destructive" | "info";
      onConfirm: () => void;
    } | null>(null);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
    const [publishingSkill, setPublishingSkill] = useState<InstalledSkill | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const listScrollRef = React.useRef<HTMLDivElement>(null);

    const { data: skills, isLoading, refetch: refetchSkills, isFetching: isRefetchingSkills } = useInstalledSkills(agentId);
    const { data: allAgents = [] } = useHermesAgents();
    // Only show selector when there are non-default agents
    const nonDefaultAgents = allAgents.filter((a) => !a.isDefault && a.name !== "default");
    const showAgentSelector = nonDefaultAgents.length > 0;
    const { data: skillBackups = [], refetch: refetchSkillBackups, isFetching: isFetchingSkillBackups } = useSkillBackups();
    const deleteBackupMutation = useDeleteSkillBackup();
    const toggleFavoriteMutation = useToggleSkillFavorite(agentId);
    const uninstallMutation = useUninstallSkill();
    const restoreBackupMutation = useRestoreSkillBackup();
    const { data: unmanagedSkills, refetch: scanUnmanaged } = useScanUnmanagedSkills();
    const importMutation = useImportSkillsFromApps();
    const installFromZipMutation = useInstallSkillsFromZip();
    const { data: skillUpdates, refetch: checkUpdates } = useCheckSkillUpdates();
    const updateSkillMutation = useUpdateSkill();
    const [isUpdatingAll, setIsUpdatingAll] = useState(false);

    const updatesMap = useMemo(() => {
      const map: Record<string, SkillUpdateInfo> = {};
      if (skillUpdates) for (const u of skillUpdates) map[u.id] = u;
      return map;
    }, [skillUpdates]);

    const filteredSkills = useMemo(() => {
      if (!skills) return [];
      const q = searchQuery.trim().toLowerCase();
      if (!q) return skills;
      return skills.filter(
        (s) => s.name.toLowerCase().includes(q) || s.directory.toLowerCase().includes(q) || (s.description?.toLowerCase().includes(q) ?? false),
      );
    }, [skills, searchQuery]);

    const installedKeys = useMemo(() => {
      if (!skills) return new Set<string>();
      const keys = new Set<string>();
      for (const s of skills) {
        const owner = s.repoOwner?.toLowerCase() || "";
        const name = s.repoName?.toLowerCase() || "";
        keys.add(`${s.directory.toLowerCase()}:${owner}:${name}`);
        // slug key: use the last path segment so that
        // "openclaw-imports/opencli-explorer" matches slug "opencli-explorer"
        const leaf = s.directory.split(/[/\\]/).pop()?.toLowerCase() ?? s.directory.toLowerCase();
        keys.add(`slug:${leaf}`);
        keys.add(`slug:${s.directory.toLowerCase()}`);
      }
      return keys;
    }, [skills]);

    const handleToggleFavorite = async (id: string, isFavorite: boolean) => {
      try {
        await toggleFavoriteMutation.mutateAsync({ id, isFavorite });
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleUninstall = (skill: InstalledSkill) => {
      setConfirmDialog({
        isOpen: true,
        title: t("skills.uninstall"),
        message: t("skills.uninstallConfirm", { name: skill.name }),
        onConfirm: async () => {
          try {
            const installName = skill.directory.split(/[/\\]/).pop()?.toLowerCase() || skill.directory.toLowerCase();
            const skillKey = `${installName}:${skill.repoOwner?.toLowerCase() || ""}:${skill.repoName?.toLowerCase() || ""}`;
            const result = await uninstallMutation.mutateAsync({ id: skill.id, skillKey });
            setConfirmDialog(null);
            toast.success(t("skills.uninstallSuccess", { name: skill.name }), {
              description: result.backupPath ? t("skills.backup.location", { path: result.backupPath }) : undefined,
              closeButton: true,
            });
          } catch (error) {
            toast.error(t("common.error"), { description: String(error) });
          }
        },
      });
    };

    const handleOpenImport = async () => {
      try {
        const result = await scanUnmanaged();
        if (!result.data || result.data.length === 0) {
          toast.success(t("skills.noUnmanagedFound"), { closeButton: true });
          return;
        }
        setImportDialogOpen(true);
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleImport = async (imports: ImportSkillSelection[]) => {
      try {
        const imported = await importMutation.mutateAsync(imports);
        setImportDialogOpen(false);
        toast.success(t("skills.importSuccess", { count: imported.length }), { closeButton: true });
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleInstallFromZip = async () => {
      try {
        const filePath = await skillsApi.openZipFileDialog();
        if (!filePath) return;
        const installed = await installFromZipMutation.mutateAsync({ filePath, currentApp });
        if (installed.length === 0) {
          toast.info(t("skills.installFromZip.noSkillsFound"), { closeButton: true });
        } else if (installed.length === 1) {
          toast.success(t("skills.installFromZip.successSingle", { name: installed[0].name }), { closeButton: true });
        } else {
          toast.success(t("skills.installFromZip.successMultiple", { count: installed.length }), { closeButton: true });
        }
      } catch (error) {
        toast.error(t("skills.installFailed"), { description: String(error) });
      }
    };

    const handleCheckUpdates = async () => {
      try {
        const result = await checkUpdates();
        const updates = result.data || [];
        if (updates.length === 0) {
          toast.success(t("skills.noUpdates"), { closeButton: true });
        } else {
          toast.info(t("skills.updatesFound", { count: updates.length }), { closeButton: true });
        }
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleUpdateSkill = async (skill: InstalledSkill) => {
      try {
        const updated = await updateSkillMutation.mutateAsync(skill.id);
        toast.success(t("skills.updateSuccess", { name: updated.name }), { closeButton: true });
      } catch (error) {
        toast.error(t("skills.updateFailed"), { description: String(error) });
      }
    };

    const handleUpdateAll = async () => {
      if (!skillUpdates || skillUpdates.length === 0) return;
      setIsUpdatingAll(true);
      let successCount = 0;
      for (const update of skillUpdates) {
        try {
          await updateSkillMutation.mutateAsync(update.id);
          successCount++;
        } catch (error) {
          toast.error(t("skills.updateFailed"), { description: `${update.name}: ${String(error)}` });
        }
      }
      setIsUpdatingAll(false);
      if (successCount > 0) toast.success(t("skills.updateAllSuccess", { count: successCount }), { closeButton: true });
    };

    const handleOpenRestoreFromBackup = async () => {
      setRestoreDialogOpen(true);
      try {
        await refetchSkillBackups();
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleRestoreFromBackup = async (backupId: string) => {
      try {
        const restored = await restoreBackupMutation.mutateAsync({ backupId, currentApp });
        setRestoreDialogOpen(false);
        toast.success(t("skills.restoreFromBackup.success", { name: restored.name }), { closeButton: true });
      } catch (error) {
        toast.error(t("skills.restoreFromBackup.failed"), { description: String(error) });
      }
    };

    const handleDeleteBackup = (backup: SkillBackupEntry) => {
      setConfirmDialog({
        isOpen: true,
        title: t("skills.restoreFromBackup.deleteConfirmTitle"),
        message: t("skills.restoreFromBackup.deleteConfirmMessage", { name: backup.skill.name }),
        confirmText: t("skills.restoreFromBackup.delete"),
        variant: "destructive",
        onConfirm: async () => {
          try {
            await deleteBackupMutation.mutateAsync(backup.backupId);
            await refetchSkillBackups();
            setConfirmDialog(null);
            toast.success(t("skills.restoreFromBackup.deleteSuccess", { name: backup.skill.name }), { closeButton: true });
          } catch (error) {
            toast.error(t("skills.restoreFromBackup.deleteFailed"), { description: String(error) });
          }
        },
      });
    };

    React.useImperativeHandle(ref, () => ({
      openDiscovery: onOpenDiscovery,
      openImport: handleOpenImport,
      openInstallFromZip: handleInstallFromZip,
      openRestoreFromBackup: handleOpenRestoreFromBackup,
      checkUpdates: handleCheckUpdates,
      scrollToTop: () => listScrollRef.current?.scrollTo({ top: 0 }),
    }));

    return (
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ─── Left: installed list ─── */}
        <div className="w-[46%] min-w-0 flex flex-col border-r overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b shrink-0">
            <span className="text-xs font-medium text-foreground shrink-0">
              {t("skills.manage")}
              {skills && skills.length > 0 && (
                <span className="ml-1.5 text-muted-foreground font-normal">({skills.length})</span>
              )}
            </span>
            <span className="flex-1" />
            <div
              className="transition-all duration-300 ease-out overflow-hidden"
              style={{ maxWidth: skillUpdates && skillUpdates.length > 0 ? "160px" : "0px", opacity: skillUpdates && skillUpdates.length > 0 ? 1 : 0 }}
            >
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1 whitespace-nowrap" onClick={() => void handleUpdateAll()} disabled={isUpdatingAll || updateSkillMutation.isPending}>
                {isUpdatingAll ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                {isUpdatingAll ? t("skills.updatingAll") : t("skills.updateAll", { count: skillUpdates?.length ?? 0 })}
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" title={t("skills.reload", { defaultValue: "重新加载" })} onClick={() => void refetchSkills()} disabled={isRefetchingSkills}>
              {isRefetchingSkills ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} className="rotate-180" />}
            </Button>
          </div>

          {/* Search */}
          {skills && skills.length > 0 && (
            <div className="px-3 py-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("skills.search", { defaultValue: "搜索技能..." })}
                  className="w-full pl-8 pr-3 py-1 text-xs rounded-md border bg-transparent placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* List */}
          <div ref={listScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-6">
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("skills.loading")}</div>
            ) : !skills || skills.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                <Sparkles size={20} className="text-muted-foreground mb-2 opacity-40" />
                <p className="text-sm font-medium text-foreground">{t("skills.noInstalled")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("skills.noInstalledDescription")}</p>
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                {t("skills.noSearchResults", { defaultValue: "没有匹配的技能" })}
              </div>
            ) : (
              <TooltipProvider delayDuration={300}>
                <div className="rounded-xl border border-border-default overflow-hidden">
                  {filteredSkills.map((skill, index) => (
                    <InstalledSkillListItem
                      key={skill.id}
                      skill={skill}
                      hasUpdate={!!updatesMap[skill.id]}
                      isUpdating={updateSkillMutation.isPending && updateSkillMutation.variables === skill.id}
                      onToggleFavorite={handleToggleFavorite}
                      onUninstall={() => handleUninstall(skill)}
                      onUpdate={() => void handleUpdateSkill(skill)}
                      onPublish={() => setPublishingSkill(skill)}
                      isLast={index === filteredSkills.length - 1}
                    />
                  ))}
                </div>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* ─── Right: browse ─── */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <BrowsePanel
            installedKeys={installedKeys}
            onInstalled={() => void refetchSkills()}
            agentId={agentId}
          />
        </div>

        {/* Dialogs */}
        {confirmDialog && (
          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmText={confirmDialog.confirmText}
            variant={confirmDialog.variant}
            zIndex="top"
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}

        {importDialogOpen && unmanagedSkills && (
          <ImportSkillsDialog
            skills={unmanagedSkills}
            isImporting={importMutation.isPending}
            onImport={handleImport}
            onClose={() => setImportDialogOpen(false)}
          />
        )}

        <RestoreSkillsDialog
          backups={skillBackups}
          isDeleting={deleteBackupMutation.isPending}
          isLoading={isFetchingSkillBackups}
          onDelete={handleDeleteBackup}
          isRestoring={restoreBackupMutation.isPending}
          onRestore={handleRestoreFromBackup}
          onClose={() => setRestoreDialogOpen(false)}
          open={restoreDialogOpen}
        />

        {publishingSkill && (
          <PublishDialog skill={publishingSkill} onClose={() => setPublishingSkill(null)} />
        )}
      </div>
    );
  },
);

UnifiedSkillsPanel.displayName = "UnifiedSkillsPanel";

// ─── Installed skill list item ────────────────────────────────────────────────

interface InstalledSkillListItemProps {
  skill: InstalledSkill;
  hasUpdate?: boolean;
  isUpdating?: boolean;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onUninstall: () => void;
  onUpdate?: () => void;
  onPublish?: () => void;
  isLast?: boolean;
}

const InstalledSkillListItem: React.FC<InstalledSkillListItemProps> = ({
  skill, hasUpdate, isUpdating, onToggleFavorite, onUninstall, onUpdate, onPublish, isLast,
}) => {
  const { t } = useTranslation();
  const openDocs = async () => {
    if (!skill.readmeUrl) return;
    try { await settingsApi.openExternal(skill.readmeUrl); } catch { /* ignore */ }
  };
  const sourceLabel = useMemo(() => {
    if (skill.repoOwner && skill.repoName) return `${skill.repoOwner}/${skill.repoName}`;
    return t("skills.local");
  }, [skill.repoOwner, skill.repoName, t]);

  return (
    <ListItemRow isLast={isLast}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm text-foreground truncate">{skill.name}</span>
          {skill.readmeUrl && (
            <button type="button" onClick={openDocs} className="text-muted-foreground/60 hover:text-foreground flex-shrink-0">
              <ExternalLink size={12} />
            </button>
          )}
          <span className="text-xs text-muted-foreground/50 flex-shrink-0">{sourceLabel}</span>
          {hasUpdate && (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 h-4 border-amber-500 text-amber-600 dark:text-amber-400">
              {t("skills.updateAvailable")}
            </Badge>
          )}
        </div>
        {skill.description && (
          <p className="text-xs text-muted-foreground truncate" title={skill.description}>{skill.description}</p>
        )}
      </div>

      <div className="flex-shrink-0 flex items-center gap-0.5">
        <Button
          type="button" variant="ghost" size="icon"
          className={`h-7 w-7 transition-opacity ${skill.isFavorite ? "opacity-100 text-amber-500" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-amber-500"}`}
          onClick={() => onToggleFavorite(skill.id, !skill.isFavorite)}
          title={skill.isFavorite ? t("skills.unfavorite", { defaultValue: "取消常用" }) : t("skills.favorite", { defaultValue: "标记常用" })}
        >
          <Star size={14} fill={skill.isFavorite ? "currentColor" : "none"} />
        </Button>
      </div>

      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={hasUpdate ? { opacity: 1 } : undefined}>
        {onPublish && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-blue-500 hover:bg-blue-100 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 opacity-0 group-hover:opacity-100" onClick={onPublish} title={t("skills.clawhub.publish", { defaultValue: "发布到 Local ClawHub" })}>
            <Upload size={13} />
          </Button>
        )}
        {hasUpdate && onUpdate && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-blue-500 hover:bg-blue-100 dark:hover:text-blue-400 dark:hover:bg-blue-500/10" onClick={onUpdate} disabled={isUpdating} title={t("skills.update")}>
            {isUpdating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:text-red-500 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-500/10" onClick={onUninstall} title={t("skills.uninstall")}>
          <Trash2 size={14} />
        </Button>
      </div>
    </ListItemRow>
  );
};

// ─── Dialogs (unchanged from original) ───────────────────────────────────────

interface ImportSkillsDialogProps {
  skills: Array<{ directory: string; name: string; description?: string; foundIn: string[]; path: string }>;
  isImporting: boolean;
  onImport: (imports: ImportSkillSelection[]) => void;
  onClose: () => void;
}

interface RestoreSkillsDialogProps {
  backups: SkillBackupEntry[];
  isDeleting: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  onDelete: (backup: SkillBackupEntry) => void;
  onRestore: (backupId: string) => void;
  onClose: () => void;
  open: boolean;
}

const RestoreSkillsDialog: React.FC<RestoreSkillsDialogProps> = ({ backups, isDeleting, isLoading, isRestoring, onDelete, onRestore, onClose, open }) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" zIndex="alert">
        <DialogHeader>
          <DialogTitle>{t("skills.restoreFromBackup.title")}</DialogTitle>
          <DialogDescription>{t("skills.restoreFromBackup.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : backups.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("skills.restoreFromBackup.empty")}</div>
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div key={backup.backupId} className="rounded-xl border border-border-default bg-background/70 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm text-foreground">{backup.skill.name}</div>
                        <div className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{backup.skill.directory}</div>
                      </div>
                      {backup.skill.description && <div className="mt-2 text-sm text-muted-foreground">{backup.skill.description}</div>}
                      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        <div>{t("skills.restoreFromBackup.createdAt")}: {formatSkillBackupDate(backup.createdAt)}</div>
                        <div className="break-all" title={backup.backupPath}>{t("skills.restoreFromBackup.path")}: {backup.backupPath}</div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:min-w-28">
                      <Button type="button" variant="outline" onClick={() => onRestore(backup.backupId)} disabled={isRestoring || isDeleting}>
                        {isRestoring ? t("skills.restoreFromBackup.restoring") : t("skills.restoreFromBackup.restore")}
                      </Button>
                      <Button type="button" variant="destructive" onClick={() => onDelete(backup)} disabled={isRestoring || isDeleting}>
                        {isDeleting ? t("skills.restoreFromBackup.deleting") : t("skills.restoreFromBackup.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ImportSkillsDialog: React.FC<ImportSkillsDialogProps> = ({ skills, isImporting, onImport, onClose }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set(skills.map((s) => s.directory)));
  const toggleSelect = (directory: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(directory)) newSelected.delete(directory);
    else newSelected.add(directory);
    setSelected(newSelected);
  };
  const handleImport = () => {
    onImport(Array.from(selected).map((directory) => {
      const skill = skills.find((s) => s.directory === directory);
      return {
        directory,
        apps: {
          claude: skill?.foundIn.includes("claude") ?? false,
          codex: skill?.foundIn.includes("codex") ?? false,
          gemini: skill?.foundIn.includes("gemini") ?? false,
          opencode: skill?.foundIn.includes("opencode") ?? false,
          openclaw: false,
          hermes: skill?.foundIn.includes("hermes") ?? false,
        },
      };
    }));
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-semibold mb-2">{t("skills.import")}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t("skills.importDescription")}</p>
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {skills.map((skill) => (
            <div key={skill.directory} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted">
              <input type="checkbox" checked={selected.has(skill.directory)} onChange={() => toggleSelect(skill.directory)} className="mt-1" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{skill.name}</div>
                {skill.description && <div className="text-sm text-muted-foreground line-clamp-1">{skill.description}</div>}
                <div className="text-xs text-muted-foreground/50 mt-1 truncate" title={skill.path}>{skill.path}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>{t("common.cancel")}</Button>
          <Button onClick={handleImport} disabled={selected.size === 0 || isImporting}>{t("skills.importSelected", { count: selected.size })}</Button>
        </div>
      </div>
    </div>
  );
};

export default UnifiedSkillsPanel;
