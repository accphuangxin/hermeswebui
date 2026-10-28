import { useTranslation } from "react-i18next";
import {
  BarChart2,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  Route,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { UpdateBadge } from "@/components/UpdateBadge";

export type HeaderNavView =
  | "hermesAgents"
  | "skills"
  | "hermesKanban"
  | "hermesSummary"
  | "hermesKnowledge"
  | "providers"
  | "procurement";

interface NavViewItem {
  view: HeaderNavView;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

interface NavActionItem {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

interface HeaderNavProps {
  currentView: string;
  onNavigate: (view: HeaderNavView) => void;
  onOpenSettings: () => void;
}

function NavDropdown({
  label,
  items,
  actions = [],
  currentView,
  onNavigate,
}: {
  label: string;
  items: NavViewItem[];
  actions?: NavActionItem[];
  currentView: string;
  onNavigate: (view: HeaderNavView) => void;
}) {
  const groupActive = items.some((item) => item.view === currentView);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "shrink-0 gap-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5",
            groupActive && "bg-muted font-medium text-foreground",
          )}
        >
          {label}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        {items.map(({ view, label: itemLabel, Icon }) => (
          <DropdownMenuItem
            key={view}
            onClick={() => onNavigate(view)}
            className={cn(
              "cursor-pointer",
              currentView === view && "bg-accent font-medium",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {itemLabel}
          </DropdownMenuItem>
        ))}
        {actions.map(({ key, label: actionLabel, Icon, onClick }) => (
          <DropdownMenuItem
            key={key}
            onClick={onClick}
            className="cursor-pointer"
          >
            <Icon className="h-3.5 w-3.5" />
            {actionLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HeaderNav({
  currentView,
  onNavigate,
  onOpenSettings,
}: HeaderNavProps) {
  const { t } = useTranslation();

  const aiItems: NavViewItem[] = [
    {
      view: "hermesAgents",
      label: t("hermes.agents.button", { defaultValue: "智能体" }),
      Icon: Users,
    },
    {
      view: "skills",
      label: t("skills.title", { defaultValue: "Skills 管理" }),
      Icon: Sparkles,
    },
    {
      view: "hermesKanban",
      label: t("kanban.title", { defaultValue: "任务看板" }),
      Icon: LayoutDashboard,
    },
    {
      view: "hermesSummary",
      label: t("nav.chatSummary", { defaultValue: "对话总结" }),
      Icon: BarChart2,
    },
    {
      view: "hermesKnowledge",
      label: t("knowledge.title", { defaultValue: "知识库" }),
      Icon: BookOpen,
    },
    {
      view: "providers",
      label: t("nav.route", { defaultValue: "路由" }),
      Icon: Route,
    },
  ];

  const aiActions: NavActionItem[] = [
    {
      key: "settings",
      label: t("settings.title", { defaultValue: "设置" }),
      Icon: Settings,
      onClick: onOpenSettings,
    },
  ];

  const businessItems: NavViewItem[] = [
    {
      view: "procurement",
      label: t("procurement.title", { defaultValue: "智能采购" }),
      Icon: ShoppingCart,
    },
  ];

  return (
    <>
      <NavDropdown
        label={t("nav.aiManagement", { defaultValue: "AI 管理" })}
        items={aiItems}
        actions={aiActions}
        currentView={currentView}
        onNavigate={onNavigate}
      />
      <NavDropdown
        label={t("nav.businessProcessing", { defaultValue: "业务处理" })}
        items={businessItems}
        currentView={currentView}
        onNavigate={onNavigate}
      />
      <UpdateBadge onClick={onOpenSettings} showLabel />
    </>
  );
}
