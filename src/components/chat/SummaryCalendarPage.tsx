import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, BarChart2, Sparkles, RefreshCw, X, Settings } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatApi } from "@/lib/api/chat";
import { chatKeys } from "@/hooks/useHermesChat";
import { formatSessionAsMarkdown } from "@/lib/chatExport";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/types";

interface SummaryCalendarPageProps {
  agentId: string | null;
  templateOpen?: boolean;
  onTemplateOpenChange?: (open: boolean) => void;
  viewYear?: number;
  viewMonth?: number;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onGoToToday?: () => void;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function normalizeSummary(summary: string): string {
  const trimmed = summary.trim();
  // strip markdown code fences, then try JSON parse
  const stripped = trimmed.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  const candidate = stripped.startsWith("{") ? stripped : trimmed.startsWith("{") ? trimmed : null;
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed.summary === "string") return parsed.summary;
    } catch {}
  }
  return trimmed;
}

export function SummaryCalendarPage({ agentId, templateOpen: templateOpenProp, onTemplateOpenChange, viewYear: viewYearProp, viewMonth: viewMonthProp }: SummaryCalendarPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const now = new Date();
  const [viewYearInternal, setViewYearInternal] = useState(now.getFullYear());
  const [viewMonthInternal, setViewMonthInternal] = useState(now.getMonth());
  const viewYear = viewYearProp ?? viewYearInternal;
  const viewMonth = viewMonthProp ?? viewMonthInternal;
  void setViewYearInternal; void setViewMonthInternal;
  // selected date for daily report
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // selected single session for right panel
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [reportCollapsed, setReportCollapsed] = useState(false);
  const [summaryConfirming, setSummaryConfirming] = useState(false);
  const summaryConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reportConfirming, setReportConfirming] = useState(false);
  const reportConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReportButtonClick = () => {
    if (!selectedDate) return;
    if (!reportContent[selectedDate]) {
      void handleGenerateReport(selectedDate);
      return;
    }
    if (reportConfirming) {
      if (reportConfirmTimer.current) clearTimeout(reportConfirmTimer.current);
      setReportConfirming(false);
      void handleGenerateReport(selectedDate);
    } else {
      setReportConfirming(true);
      reportConfirmTimer.current = setTimeout(() => setReportConfirming(false), 3000);
    }
  };

  const handleSummaryButtonClick = () => {
    if (!selectedSession?.summary) {
      void handleGenerateSummary();
      return;
    }
    if (summaryConfirming) {
      if (summaryConfirmTimer.current) clearTimeout(summaryConfirmTimer.current);
      setSummaryConfirming(false);
      void handleGenerateSummary();
    } else {
      setSummaryConfirming(true);
      summaryConfirmTimer.current = setTimeout(() => setSummaryConfirming(false), 3000);
    }
  };

  // Template settings — controlled by parent if templateOpenProp provided
  const [templateOpenInternal, setTemplateOpenInternal] = useState(false);
  const templateOpen = templateOpenProp ?? templateOpenInternal;
  const setTemplateOpen = (v: boolean) => {
    setTemplateOpenInternal(v);
    onTemplateOpenChange?.(v);
  };
  const [templateSummary, setTemplateSummary] = useState("");
  const [templateDailyReport, setTemplateDailyReport] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  useEffect(() => {
    if (templateOpen) {
      chatApi.getSummaryTemplate().then(t => {
        setTemplateSummary(t.summary);
        setTemplateDailyReport(t.dailyReport);
      }).catch(() => {});
    }
  }, [templateOpen]);

  const handleSaveTemplate = async () => {
    setTemplateSaving(true);
    try {
      await chatApi.setSummaryTemplate(templateSummary, templateDailyReport);
      toast.success("模板已保存");
      setTemplateOpen(false);
    } catch (err) {
      toast.error("保存失败: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTemplateSaving(false);
    }
  };

  const { data: sessions = [] } = useQuery({
    queryKey: chatKeys.sessions(agentId),
    queryFn: () => chatApi.listSessions(agentId),
  });

  const sessionsByDate = useMemo(() => {
    const map: Record<string, ChatSession[]> = {};
    for (const s of sessions) {
      const d = new Date(s.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [sessions]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayAdj = (getFirstDayOfMonth(viewYear, viewMonth) + 6) % 7;

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 月份切换时清空选中
  useEffect(() => {
    setSelectedDate(null);
    setSelectedSession(null);
  }, [viewYear, viewMonth]);

  const handleSelectSession = (s: ChatSession, dateStr: string) => {
    setSelectedSession(s);
    setSelectedDate(dateStr);
    if (!reportContent[dateStr]) {
      chatApi.getDailyReport(dateStr, agentId).then(report => {
        if (report) setReportContent(prev => ({ ...prev, [dateStr]: report }));
      }).catch(() => {});
    }
  };

  const handleGenerateReport = async (dateStr: string) => {
    setReportLoading(dateStr);
    try {
      const d = new Date(dateStr + "T00:00:00");
      const report = await chatApi.generateDailyReport(dateStr, d.getTime(), d.getTime() + 86400000 - 1, agentId);
      setReportContent(prev => ({ ...prev, [dateStr]: report }));
    } catch (err) {
      toast.error(t("sessionManager.generateFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setReportLoading(null);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedSession) return;
    setSummaryLoading(true);
    try {
      const messages = await chatApi.getMessages(selectedSession.id);
      const filtered = messages.filter((m) => m.role !== "timeline");
      if (filtered.length === 0) {
        toast.error("该会话没有可分析的消息内容");
        return;
      }
      const content = formatSessionAsMarkdown(selectedSession.title ?? null, selectedSession.model ?? null, filtered);
      const filePath = await chatApi.saveSummaryTempFile(selectedSession.id, content);

      const updated = await chatApi.generateSessionSummary(selectedSession.id, filePath, agentId);
      setSelectedSession(updated);
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions(agentId) });
      toast.success("摘要已生成");
    } catch (err) {
      toast.error(t("sessionManager.generateFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSummaryLoading(false);
    }
  };

  const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

  const showPanel = selectedSession !== null;

  return (
    <div className="flex h-full min-h-0">
      {/* Calendar */}
      <div className="flex flex-col flex-1 min-w-0 p-4">
        {/* Weekday labels */}
        <div className="grid grid-cols-7 mb-1 shrink-0">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[11px] text-foreground/60 pb-1 font-semibold">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "1fr" }}>
          {Array.from({ length: firstDayAdj }).map((_, i) => (
            <div key={`empty-${i}`} className="border border-transparent" />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const daySessions = sessionsByDate[dateStr] ?? [];
            const isToday = dateStr === todayStr;
            const isDateSelected = dateStr === selectedDate;
            const hasSessions = daySessions.length > 0;
            const dayOfWeek = new Date(dateStr).getDay(); // 0=Sun, 6=Sat
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            // show up to 3 titles, rest as "+N"
            const visibleSessions = daySessions.slice(0, 3);
            const hiddenCount = daySessions.length - visibleSessions.length;

            return (
              <div
                key={dateStr}
                className={cn(
                  "relative flex flex-col rounded-lg border p-1.5 overflow-hidden shadow-sm",
                  isWeekend && !isDateSelected && !isToday && "bg-rose-50/60 dark:bg-rose-950/20",
                  isDateSelected
                    ? "border-blue-400/80 bg-primary/5 shadow-md"
                    : hasSessions
                    ? "border-gray-400/80 dark:border-gray-500"
                    : "border-gray-300/80 dark:border-gray-600",
                  isToday && !isDateSelected && "border-amber-400/70 bg-amber-50/80 dark:bg-amber-950/30",
                )}
              >
                {/* Date number */}
                <span className={cn(
                  "text-xs font-semibold mb-1 shrink-0",
                  isDateSelected
                    ? "text-primary"
                    : isToday
                    ? "text-amber-500 dark:text-amber-400"
                    : isWeekend
                    ? "text-rose-500 dark:text-rose-400"
                    : hasSessions
                    ? "text-foreground"
                    : "text-foreground/35",
                )}>
                  {day}
                </span>

                {/* Session title list */}
                {hasSessions && (
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {visibleSessions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectSession(s, dateStr)}
                        className={cn(
                          "text-left truncate rounded-sm px-1.5 py-0.5 text-sm leading-snug transition-colors w-full",
                          selectedSession?.id === s.id
                            ? "bg-blue-200/70 dark:bg-blue-800/50 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-400/40"
                            : "text-foreground/70 hover:bg-muted hover:text-foreground",
                        )}
                        title={s.title || "未命名"}
                      >
                        {s.title || t("hermes.chat.untitled")}
                      </button>
                    ))}
                    {hiddenCount > 0 && (
                      <span className="text-[10px] text-foreground/40 px-1.5">
                        +{hiddenCount} 条
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel — shown when session selected */}
      {showPanel && selectedSession && (
        <div className="w-96 border-l flex flex-col min-h-0 bg-background">
          <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
            <button
              type="button"
              onClick={() => setTemplateOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted text-muted-foreground text-xs"
            >
              <Settings className="w-4 h-4" />
              模板设置
            </button>
            <button
              type="button"
              onClick={() => { setSelectedSession(null); setSelectedDate(null); }}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-4 py-3 space-y-3">
              {/* Session summary card */}
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <div className="px-3 py-2.5 border-b bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-xs text-muted-foreground shrink-0">{selectedDate}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-6 gap-1 text-xs px-2",
                          summaryConfirming && "text-orange-500 hover:text-orange-600"
                        )}
                        disabled={summaryLoading}
                        onClick={handleSummaryButtonClick}
                      >
                        {summaryLoading
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : <Sparkles className="w-3 h-3" />}
                        {summaryLoading ? "生成中..." : summaryConfirming ? "确认重新生成?" : selectedSession.summary ? "重新生成" : "生成摘要"}
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSummaryCollapsed(v => !v)}
                      className="p-1 rounded hover:bg-muted/60 text-muted-foreground shrink-0"
                    >
                      <ChevronDown className={cn("w-4 h-4 transition-transform", summaryCollapsed && "-rotate-90")} />
                    </button>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground leading-snug mt-0.5">
                    {selectedSession.title || t("hermes.chat.untitled")}
                  </h3>
                </div>
                {!summaryCollapsed && (
                  <div className="px-3 py-2.5">
                    {parseTags(selectedSession.tags).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {parseTags(selectedSession.tags).map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded-full bg-muted text-xs text-foreground/70 font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {selectedSession.summary ? (
                      <div className="text-sm text-foreground/85 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                        <Markdown remarkPlugins={[remarkGfm]}>{normalizeSummary(selectedSession.summary)}</Markdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        暂无摘要，点击「生成摘要」让 AI 分析此次对话
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Daily report card */}
              <div className="rounded-lg border bg-blue-50/30 dark:bg-blue-950/20 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-blue-50/50 dark:bg-blue-950/30">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-blue-700/70 dark:text-blue-300/70">
                      {selectedDate}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-6 gap-1 text-xs px-2",
                        reportConfirming && "text-orange-500 hover:text-orange-600"
                      )}
                      disabled={reportLoading === selectedDate}
                      onClick={handleReportButtonClick}
                    >
                      {reportLoading === selectedDate
                        ? <RefreshCw className="w-3 h-3 animate-spin" />
                        : <BarChart2 className="w-3 h-3" />}
                      {reportLoading === selectedDate ? "生成中..." : reportConfirming ? "确认重新生成?" : reportContent[selectedDate!] ? "重新生成" : "生成日报"}
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReportCollapsed(v => !v)}
                    className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
                  >
                    <ChevronDown className={cn("w-4 h-4 transition-transform", reportCollapsed && "-rotate-90")} />
                  </button>
                </div>
                {!reportCollapsed && (
                  <div className="px-3 py-2.5">
                    {reportContent[selectedDate!] ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none
                        prose-headings:font-semibold prose-headings:text-foreground
                        prose-h1:text-sm prose-h2:text-sm prose-h3:text-xs
                        prose-p:text-sm prose-p:text-foreground/85 prose-p:leading-relaxed
                        prose-li:text-sm prose-li:text-foreground/85
                        prose-strong:text-foreground">
                        <Markdown remarkPlugins={[remarkGfm]}>
                          {reportContent[selectedDate!]}
                        </Markdown>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        点击「生成日报」获取当天所有对话的 AI 汇总
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Template settings dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-5xl w-full p-0 gap-0 overflow-hidden top-[55%]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-base">对话总结模板设置</DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 gap-4 p-5" style={{ height: "70vh" }}>
            {/* Summary template */}
            <div className="flex-1 flex flex-col rounded-lg border overflow-hidden min-w-0">
              <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
                <p className="text-sm font-medium">会话摘要 Prompt 模板</p>
                <p className="text-xs text-muted-foreground mt-1">
                  可用变量：
                  <code className="bg-background border rounded px-1.5 py-0.5 font-mono text-[11px] mx-1">{"{conversation}"}</code>
                  对话内容正文
                </p>
              </div>
              <textarea
                value={templateSummary}
                onChange={e => setTemplateSummary(e.target.value)}
                spellCheck={false}
                className="flex-1 w-full bg-background px-4 py-3 text-sm font-mono resize-none focus:outline-none leading-relaxed"
              />
            </div>

            {/* Daily report template */}
            <div className="flex-1 flex flex-col rounded-lg border overflow-hidden min-w-0">
              <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
                <p className="text-sm font-medium">每日报告 Prompt 模板</p>
                <p className="text-xs text-muted-foreground mt-1">
                  可用变量：
                  <code className="bg-background border rounded px-1.5 py-0.5 font-mono text-[11px] mx-1">{"{count}"}</code>
                  会话数量
                  <code className="bg-background border rounded px-1.5 py-0.5 font-mono text-[11px] mx-1">{"{session_list}"}</code>
                  摘要列表
                </p>
              </div>
              <textarea
                value={templateDailyReport}
                onChange={e => setTemplateDailyReport(e.target.value)}
                spellCheck={false}
                className="flex-1 w-full bg-background px-4 py-3 text-sm font-mono resize-none focus:outline-none leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplateOpen(false)}>
              取消
            </Button>
            <Button size="sm" disabled={templateSaving} onClick={() => void handleSaveTemplate()}>
              {templateSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
