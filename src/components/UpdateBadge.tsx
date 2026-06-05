import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

interface UpdateBadgeProps {
  className?: string;
  onClick?: () => void;
  showLabel?: boolean;
}

export function UpdateBadge({ className = "", onClick, showLabel }: UpdateBadgeProps) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      title={t("common.settings", { defaultValue: "设置" })}
      onClick={onClick}
      className={`${showLabel ? "gap-1.5 text-xs" : "h-8 w-8 rounded-full"} text-muted-foreground hover:bg-muted/60 ${className}`}
    >
      <Settings className={showLabel ? "h-3.5 w-3.5" : "h-5 w-5"} />
      {showLabel && t("common.settings", { defaultValue: "设置" })}
    </Button>
  );
}
