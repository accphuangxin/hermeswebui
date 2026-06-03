import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AgentsButtonProps {
  isActive: boolean;
  onClick: () => void;
}

export function AgentsButton({ isActive, onClick }: AgentsButtonProps) {
  const { t } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7 shrink-0 hover:bg-black/5 dark:hover:bg-white/5", isActive && "text-primary")}
      title={t("hermes.agents.button", { defaultValue: "智能体" })}
      onClick={onClick}
    >
      <Users className="w-3.5 h-3.5" />
    </Button>
  );
}
