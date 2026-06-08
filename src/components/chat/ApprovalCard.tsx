import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@/hooks/useChatStream";

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
}

export function ApprovalCard({
  approval,
  onApprove,
  onDeny,
}: ApprovalCardProps) {
  const { t } = useTranslation();

  let formattedArgs = approval.args;
  try {
    formattedArgs = JSON.stringify(JSON.parse(approval.args), null, 2);
  } catch {
    // keep raw
  }

  return (
    <div className="mx-3 my-2 border border-amber-500/50 rounded-lg bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
        <ShieldAlert className="w-4 h-4" />
        {t("hermes.chat.approvalRequired")}
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        <span className="font-medium">{approval.tool}</span>
      </div>
      {formattedArgs && formattedArgs !== '""' && (
        <pre className="text-[11px] bg-muted/50 rounded p-2 mb-3 overflow-x-auto whitespace-pre-wrap max-h-[120px]">
          {formattedArgs}
        </pre>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={onApprove}
          className="h-7 text-xs"
        >
          {t("hermes.chat.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDeny}
          className="h-7 text-xs"
        >
          {t("hermes.chat.deny")}
        </Button>
      </div>
    </div>
  );
}
