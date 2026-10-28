import { useCallback, useRef, useState, KeyboardEvent, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Square,
  Paperclip,
  X,
  Sparkles,
  Bot,
  Eye,
  EyeOff,
  Zap,
  Star,
  Mic,
  Loader2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chatApi } from "@/lib/api/chat";
import { useSettingsQuery } from "@/lib/query";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";
import type { ChatFileRef } from "@/types";
import type { InstalledSkill } from "@/lib/api/skills";
import type { HermesAgent } from "@/lib/api/agents";

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/json": "json",
    "application/zip": "zip",
  };
  return map[mimeType] ?? mimeType.split("/")[1]?.split(";")[0] ?? "bin";
}

const HERMES_COMMANDS = [
  { cmd: "/clear", desc: "Clear conversation and start fresh" },
  { cmd: "/export", desc: "Export current session as Markdown" },
  { cmd: "/preview", desc: "Toggle Markdown preview panel" },
];

interface ChatInputProps {
  onSend: (text: string, files: ChatFileRef[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  isStopping?: boolean;
  disabled?: boolean;
  favoriteSkills?: InstalledSkill[];
  allSkills?: InstalledSkill[];
  onToggleSkillFavorite?: (id: string, isFavorite: boolean) => void;
  agents?: HermesAgent[];
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string, port?: number, key?: string) => void;
  /** 未启用语音输入时，点击麦克风可直接跳到 设置 → 通用 */
  onOpenVoiceSettings?: () => void;
  onTogglePreview?: () => void;
  isPreviewOpen?: boolean;
  onHeightChange?: (delta: number) => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  isStopping = false,
  disabled,
  favoriteSkills = [],
  allSkills,
  onToggleSkillFavorite,
  agents = [],
  selectedAgentId,
  onSelectAgent,
  onOpenVoiceSettings,
  onTogglePreview,
  isPreviewOpen,
  onHeightChange,
}: ChatInputProps) {
  const { t } = useTranslation();
  const skillList = allSkills ?? favoriteSkills;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<ChatFileRef[]>([]);
  const attachCounterRef = useRef(0);

  // slash command state
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // skill panel state
  const [showSkillPanel, setShowSkillPanel] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const skillPanelRef = useRef<HTMLDivElement>(null);
  const skillSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showSkillPanel) {
      setSkillSearch("");
      return;
    }
    const handle = (e: MouseEvent) => {
      if (
        skillPanelRef.current &&
        !skillPanelRef.current.contains(e.target as Node)
      ) {
        setShowSkillPanel(false);
      }
    };
    document.addEventListener("mousedown", handle);
    setTimeout(() => skillSearchRef.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSkillPanel]);

  // @mention state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionTriggerPos, setMentionTriggerPos] = useState(-1);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  // ~agent state
  const [showAgents, setShowAgents] = useState(false);
  const [agentFilter, setAgentFilter] = useState("");
  const [agentSelectedIndex, setAgentSelectedIndex] = useState(0);
  const [agentTriggerPos, setAgentTriggerPos] = useState(-1);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const compositionEndTimeRef = useRef(0);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filteredCommands = HERMES_COMMANDS.filter((c) =>
    c.cmd.startsWith(commandFilter || "/"),
  );

  const filteredSkills = favoriteSkills.filter(
    (s) =>
      s.name.toLowerCase().includes(mentionFilter.toLowerCase()) ||
      s.directory.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  const filteredAgents = agents.filter((a) => {
    if (a.status === "stopped") return false;
    const name = a.name.toLowerCase();
    const desc = (a.description ?? "").toLowerCase();
    const q = agentFilter.toLowerCase();
    return name.includes(q) || desc.includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [commandFilter]);

  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionFilter]);

  useEffect(() => {
    setAgentSelectedIndex(0);
  }, [agentFilter]);

  // scroll the highlighted mention item into view
  useEffect(() => {
    if (!showMentions || !mentionMenuRef.current) return;
    const el =
      mentionMenuRef.current.querySelectorAll<HTMLButtonElement>("button")[
        mentionSelectedIndex
      ];
    el?.scrollIntoView({ block: "nearest" });
  }, [mentionSelectedIndex, showMentions]);

  // scroll the highlighted agent item into view
  useEffect(() => () => stopAccelDelete(), []); // cleanup on unmount

  useEffect(() => {
    if (!showAgents || !agentMenuRef.current) return;
    const el =
      agentMenuRef.current.querySelectorAll<HTMLButtonElement>("button")[
        agentSelectedIndex
      ];
    el?.scrollIntoView({ block: "nearest" });
  }, [agentSelectedIndex, showAgents]);

  const insertFilePlaceholder = (file: ChatFileRef) => {
    const el = textareaRef.current;
    if (!el) return;
    const placeholder = `[${file.filename}]`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const needSpace =
      before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const inserted = (needSpace ? " " : "") + placeholder + " ";
    el.value = before + inserted + after;
    const newPos = start + inserted.length;
    el.setSelectionRange(newPos, newPos);
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";
    el.focus();
  };

  const handleSend = useCallback(() => {
    const value = textareaRef.current?.value.trim();
    if (!value && files.length === 0) return;

    setShowCommands(false);
    setShowMentions(false);
    setShowAgents(false);

    onSend(value || "", files);
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
  }, [onSend, files]);

  const insertCommand = (cmd: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = cmd + " ";
      textareaRef.current.focus();
    }
    setShowCommands(false);
    setCommandFilter("");
  };

  const insertMention = (skill: InstalledSkill) => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value;
    const before = value.slice(0, mentionTriggerPos);
    const after = value.slice(el.selectionStart);
    const inserted = `使用技能: ${skill.name}, `;
    el.value = before + inserted + after;
    const newPos = mentionTriggerPos + inserted.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";

    setShowMentions(false);
    setMentionFilter("");
    setMentionTriggerPos(-1);
  };

  const selectAgent = (agent: HermesAgent) => {
    const el = textareaRef.current;
    if (!el) return;
    // remove the ~fragment from the input
    const before = el.value.slice(0, agentTriggerPos);
    const after = el.value.slice(el.selectionStart);
    el.value = before + after;
    el.setSelectionRange(before.length, before.length);
    el.focus();
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 320) + "px";

    setShowAgents(false);
    setAgentFilter("");
    setAgentTriggerPos(-1);

    if (onSelectAgent) {
      const agentId =
        agent.isDefault || agent.name === "default" ? "default" : agent.name;
      onSelectAgent(
        agentId,
        agent.actualPort ?? agent.apiServerPort,
        agent.apiServerKey,
      );
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // ~agent popup takes highest priority
    if (showAgents && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAgentSelectedIndex((i) => (i + 1) % filteredAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAgentSelectedIndex(
          (i) => (i - 1 + filteredAgents.length) % filteredAgents.length,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectAgent(filteredAgents[agentSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAgents(false);
        return;
      }
    }

    // @mention popup takes priority
    if (showMentions && filteredSkills.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((i) => (i + 1) % filteredSkills.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex(
          (i) => (i - 1 + filteredSkills.length) % filteredSkills.length,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertMention(filteredSkills[mentionSelectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        insertCommand(filteredCommands[selectedIndex].cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    // Backspace: delete entire [Image #N] / [File #N] placeholder as one unit
    if (e.key === "Backspace" && !isComposingRef.current) {
      const el = textareaRef.current;
      if (el && el.selectionStart === el.selectionEnd) {
        const before = el.value.slice(0, el.selectionStart);
        const match = before.match(/\[[^\]]+\] ?$/);
        if (
          match &&
          files.some((f) => match[0].trimEnd() === `[${f.filename}]`)
        ) {
          e.preventDefault();
          const newPos = before.length - match[0].length;
          el.value =
            before.slice(0, newPos) + el.value.slice(el.selectionStart);
          el.setSelectionRange(newPos, newPos);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      // Block if IME is composing, or if compositionend fired within the last 30ms
      // (macOS WebKit fires compositionend before keydown for the confirming Enter)
      const justFinishedComposing =
        Date.now() - compositionEndTimeRef.current < 30;
      if (isComposingRef.current || justFinishedComposing) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!isStreaming && !disabled) {
        handleSend();
      }
    }
  };

  const stopAccelDelete = () => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    if (deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
  };

  const handleKeyDownAccel = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    if (isComposingRef.current) return;
    if (e.repeat) return; // native repeat already started; our timer handles it

    const el = textareaRef.current;
    if (!el) return;

    const doDelete = () => {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (start === end && start === 0 && e.key === "Backspace") return;
      if (start === end && end === el.value.length && e.key === "Delete")
        return;

      // Delete one char at cursor (or selection)
      const val = el.value;
      let newVal: string;
      let newPos: number;
      if (start !== end) {
        newVal = val.slice(0, start) + val.slice(end);
        newPos = start;
      } else if (e.key === "Backspace") {
        newVal = val.slice(0, start - 1) + val.slice(start);
        newPos = start - 1;
      } else {
        newVal = val.slice(0, start) + val.slice(start + 1);
        newPos = start;
      }
      // Use native input setter so React detects the change
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(el, newVal);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.setSelectionRange(newPos, newPos);
    };

    // After 400ms hold, start accelerated delete at 40ms intervals
    deleteTimerRef.current = setTimeout(() => {
      deleteIntervalRef.current = setInterval(doDelete, 40);
    }, 400);
  };

  const handleKeyUpAccel = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") stopAccelDelete();
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    const prevHeight = el.offsetHeight;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 320);
    el.style.height = nextHeight + "px";
    const delta = nextHeight - prevHeight;
    if (delta !== 0) onHeightChange?.(delta);

    const value = el.value;

    // Sync files: remove any file whose placeholder is no longer in the text
    setFiles((prev) => {
      const next = prev.filter((f) => value.includes(`[${f.filename}]`));
      return next.length === prev.length ? prev : next;
    });
    const cursor = el.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);

    // detect ~agent: scan backwards from cursor for '~'
    const tildeIndex = textBeforeCursor.lastIndexOf("~");
    if (tildeIndex !== -1 && agents.length > 0) {
      const fragment = textBeforeCursor.slice(tildeIndex + 1);
      if (!fragment.includes(" ") && !fragment.includes("\n")) {
        setAgentTriggerPos(tildeIndex);
        setAgentFilter(fragment);
        setShowAgents(true);
        setShowMentions(false);
        setShowCommands(false);
        return;
      }
    }
    setShowAgents(false);

    // detect @mention: scan backwards from cursor for '@'
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex !== -1 && favoriteSkills.length > 0) {
      const fragment = textBeforeCursor.slice(atIndex + 1);
      if (!fragment.includes(" ") && !fragment.includes("\n")) {
        setMentionTriggerPos(atIndex);
        setMentionFilter(fragment);
        setShowMentions(true);
        setShowCommands(false);
        return;
      }
    }
    setShowMentions(false);

    // slash command detection
    if (value.startsWith("/")) {
      const firstSpace = value.indexOf(" ");
      const partial = firstSpace === -1 ? value : value.slice(0, firstSpace);
      if (firstSpace === -1) {
        setCommandFilter(partial);
        setShowCommands(true);
      } else {
        setShowCommands(false);
      }
    } else {
      setShowCommands(false);
    }
  };

  // 语音输入：开始录音时记下插入位置；之后的临时/最终结果都整体替换这一段，
  // 从而做到「边说边出字」，而不会一段段往后面追加。
  const voiceAnchorRef = useRef<{
    start: number;
    appliedLength: number;
  } | null>(null);

  const applyVoiceText = (text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    if (!voiceAnchorRef.current) {
      const start = el.selectionStart ?? el.value.length;
      voiceAnchorRef.current = { start, appliedLength: 0 };
    }
    const { start, appliedLength } = voiceAnchorRef.current;
    const value = el.value;
    const tail = value.slice(start + appliedLength);
    const prefix = value.slice(0, start);
    const needSpace =
      prefix.length > 0 && !prefix.endsWith(" ") && !prefix.endsWith("\n");
    const body = (needSpace ? " " : "") + text;
    el.value = prefix + body + tail;
    voiceAnchorRef.current = {
      start,
      appliedLength: body.length,
    };
    const caret = start + body.length;
    el.setSelectionRange(caret, caret);
    handleInput();
  };

  // 语音输入：麦克风按钮始终显示；未启用时点击会提示去设置里开启
  const { data: appSettings } = useSettingsQuery();
  const isVoiceEnabled = appSettings?.voiceInput?.enabled === true;

  const voice = useVoiceInput({
    onPartial: applyVoiceText,
    onFinal: (text) => {
      applyVoiceText(text);
      voiceAnchorRef.current = null;
    },
    enabled: isVoiceEnabled && !disabled,
  });

  // 录音失败时提示一次，避免错误只留在 hook 里无人展示
  useEffect(() => {
    if (voice.error) {
      toast.error(voice.error);
    }
  }, [voice.error]);

  const handleVoiceToggle = () => {
    if (!isVoiceEnabled) {
      toast.info(
        t("hermes.chat.voiceNotConfigured", {
          defaultValue:
            "语音输入未启用，请先在 设置 → 通用 → 语音输入 中开启并填写 API Key",
        }),
        onOpenVoiceSettings
          ? {
              action: {
                label: t("hermes.chat.voiceOpenSettings", {
                  defaultValue: "去设置",
                }),
                onClick: onOpenVoiceSettings,
              },
            }
          : undefined,
      );
      return;
    }
    if (voice.isRecording) {
      voice.stop();
      return;
    }
    if (voice.isBusy) return;
    // 新一轮录音：清掉上一轮留下的插入锚点
    voiceAnchorRef.current = null;
    void voice.start();
  };

  const handleAttach = async () => {
    const selected = await open({
      multiple: true,
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      try {
        const { content, sizeBytes, mimeType } = await chatApi.readFile(path);
        const actualName =
          path.split("/").pop() ??
          path.split("\\").pop() ??
          `file_${Date.now()}`;
        const isImage = mimeType?.startsWith("image/");
        const label = isImage
          ? `Image #${++attachCounterRef.current}`
          : actualName;
        // All picker files get sourcePath so Hermes knows the location.
        // Images are sent by path only; non-images also send extracted text inline.
        const fileRef: ChatFileRef = {
          filename: label,
          content,
          sizeBytes,
          mimeType,
          sourcePath: path,
        };
        setFiles((prev) => [...prev, fileRef]);
        insertFilePlaceholder(fileRef);
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
  };

  const addFileFromBlob = (blob: Blob, filename: string): Promise<void> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] ?? dataUrl;
        setFiles((prev) => [
          ...prev,
          {
            filename,
            content: base64,
            sizeBytes: blob.size,
            mimeType: blob.type,
          },
        ]);
        resolve();
      };
      reader.readAsDataURL(blob);
    });
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);

      const fileItems = items.filter((item) => item.kind === "file");
      if (fileItems.length === 0) return;

      e.preventDefault();
      for (const item of fileItems) {
        const blob = item.getAsFile();
        if (!blob) continue;

        if (item.type.startsWith("image/")) {
          const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
          const tempFilename = `paste_${Date.now()}.${ext}`;
          attachCounterRef.current += 1;
          const label = `Image #${attachCounterRef.current}`;
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const savedPath = await chatApi.saveTempImage(base64, tempFilename);
            const { content, sizeBytes, mimeType } =
              await chatApi.readFile(savedPath);
            const fileRef: ChatFileRef = {
              filename: label,
              content,
              sizeBytes,
              mimeType,
              sourcePath: savedPath,
            };
            setFiles((prev) => [...prev, fileRef]);
            insertFilePlaceholder(fileRef);
          } catch {
            const fileRef: ChatFileRef = {
              filename: label,
              content: "",
              sizeBytes: blob.size,
              mimeType: blob.type,
            };
            await addFileFromBlob(blob, label);
            insertFilePlaceholder(fileRef);
          }
        } else {
          attachCounterRef.current += 1;
          const blobName = (blob as File).name;
          const ext = mimeToExt(item.type);
          const label =
            blobName && blobName !== "blob"
              ? blobName
              : `file_${attachCounterRef.current}.${ext}`;
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const savedPath = await chatApi.saveTempImage(base64, label);
            const { content, sizeBytes, mimeType } =
              await chatApi.readFile(savedPath);
            const fileRef: ChatFileRef = {
              filename: label,
              content,
              sizeBytes,
              mimeType,
              sourcePath: savedPath,
            };
            setFiles((prev) => [...prev, fileRef]);
            insertFilePlaceholder(fileRef);
          } catch {
            await addFileFromBlob(blob, label);
            insertFilePlaceholder({
              filename: label,
              content: "",
              sizeBytes: blob.size,
              mimeType: blob.type,
            });
          }
        }
      }
    },
    [],
  );

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const file = prev[index];
      if (file && textareaRef.current) {
        const el = textareaRef.current;
        const escapedName = file.filename.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        const placeholder = `\\[${escapedName}\\]`;
        el.value = el.value
          .replace(new RegExp(`\\s*${placeholder}\\s*`, "g"), " ")
          .trim();
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="border-t bg-background relative px-4 pb-4 pt-3">
      {/* ~agent popup */}
      {showAgents && filteredAgents.length > 0 && (
        <div
          ref={agentMenuRef}
          className="absolute bottom-full left-4 right-4 mb-1 bg-popover border rounded-md shadow-md max-h-[240px] overflow-y-auto z-50"
        >
          {filteredAgents.map((a, i) => {
            const name = a.name;
            const isSelected =
              a.isDefault || a.name === "default"
                ? selectedAgentId === null
                : a.name === selectedAgentId;
            return (
              <button
                key={a.name}
                onMouseEnter={() => setAgentSelectedIndex(i)}
                onClick={() => selectAgent(a)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                  i === agentSelectedIndex && "bg-muted",
                )}
              >
                <Bot className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="font-medium flex-shrink-0">{name}</span>
                {isSelected && (
                  <span className="text-[10px] text-primary font-medium ml-0.5">
                    ●
                  </span>
                )}
                {a.description && (
                  <span className="text-muted-foreground text-xs min-w-0 truncate">
                    {a.description}
                  </span>
                )}
                {a.model && (
                  <span className="text-muted-foreground/50 text-[10px] font-mono ml-auto flex-shrink-0">
                    {a.model}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* @mention popup */}
      {showMentions && filteredSkills.length > 0 && (
        <div
          ref={mentionMenuRef}
          className="absolute bottom-full left-4 right-4 mb-1 bg-popover border rounded-md shadow-md max-h-[240px] overflow-y-auto z-50"
        >
          {filteredSkills.map((s, i) => (
            <button
              key={s.id}
              onMouseEnter={() => setMentionSelectedIndex(i)}
              onClick={() => insertMention(s)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                i === mentionSelectedIndex && "bg-muted",
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <span className="font-medium flex-shrink-0">{s.name}</span>
              {s.description && (
                <span className="text-muted-foreground text-xs min-w-0 truncate">
                  {s.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* slash command popup */}
      {showCommands && filteredCommands.length > 0 && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-4 right-4 mb-1 bg-popover border rounded-md shadow-md max-h-[240px] overflow-y-auto z-50"
        >
          {filteredCommands.map((c, i) => (
            <button
              key={c.cmd}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => insertCommand(c.cmd)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors",
                i === selectedIndex && "bg-muted",
              )}
            >
              <span className="font-mono font-medium text-primary w-24 flex-shrink-0">
                {c.cmd}
              </span>
              <span className="text-muted-foreground text-xs truncate">
                {c.desc}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Skill panel popup */}
      {showSkillPanel &&
        skillList.length > 0 &&
        (() => {
          const q = skillSearch.trim().toLowerCase();
          const filtered = q
            ? skillList.filter(
                (s) =>
                  s.name.toLowerCase().includes(q) ||
                  (s.description ?? "").toLowerCase().includes(q),
              )
            : skillList;
          return (
            <div
              ref={skillPanelRef}
              className="absolute bottom-full left-4 mb-1 bg-popover border rounded-md shadow-md z-50 flex flex-col max-h-[280px] w-1/2"
            >
              <div className="px-3 py-1.5 border-b flex items-center gap-2 shrink-0">
                <input
                  ref={skillSearchRef}
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Escape" && setShowSkillPanel(false)
                  }
                  placeholder="搜索技能..."
                  className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                />
                <span className="text-xs text-muted-foreground shrink-0">
                  {filtered.length}/{skillList.length}
                </span>
              </div>
              <div className="overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-4">
                    无匹配技能
                  </div>
                ) : (
                  filtered.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center hover:bg-muted transition-colors group"
                    >
                      <button
                        onClick={() => {
                          insertMention(s);
                          setShowSkillPanel(false);
                        }}
                        className="flex items-center gap-2 flex-1 min-w-0 px-3 py-1.5 text-left"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-xs font-medium w-2/5 shrink-0 truncate">
                          {s.name}
                        </span>
                        {s.description && (
                          <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
                            {s.description}
                          </span>
                        )}
                      </button>
                      {onToggleSkillFavorite && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSkillFavorite(s.id, !s.isFavorite);
                          }}
                          className={cn(
                            "px-2 py-1.5 shrink-0 transition-colors",
                            s.isFavorite
                              ? "text-amber-400"
                              : "text-muted-foreground/30 group-hover:text-muted-foreground/60",
                          )}
                          title={s.isFavorite ? "取消常用" : "标为常用"}
                        >
                          <Star
                            className="w-3.5 h-3.5"
                            fill={s.isFavorite ? "currentColor" : "none"}
                          />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}

      <div className="relative rounded-xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring transition-shadow">
        <textarea
          ref={textareaRef}
          rows={3}
          placeholder={t("hermes.chat.placeholder")}
          disabled={disabled}
          onKeyDown={(e) => {
            handleKeyDown(e);
            handleKeyDownAccel(e);
          }}
          onKeyUp={handleKeyUpAccel}
          onBlur={stopAccelDelete}
          onInput={handleInput}
          onPaste={handlePaste}
          onCompositionStart={() => {
            isComposingRef.current = true;
            stopAccelDelete();
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            compositionEndTimeRef.current = Date.now();
          }}
          className="w-full resize-none bg-transparent pl-4 pr-24 pt-3 pb-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-50 min-h-[72px] max-h-[320px]"
        />
        {/* 语音输入：放在输入框右上角；录音时图标变红，再点一次即结束并转写 */}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {voice.isRecording && (
            <span className="select-none font-mono text-[11px] text-red-500">
              {Math.floor(voice.durationSec / 60)
                .toString()
                .padStart(2, "0")}
              :{(voice.durationSec % 60).toString().padStart(2, "0")}
            </span>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleVoiceToggle}
            disabled={disabled || (isVoiceEnabled && voice.isBusy)}
            className={cn(
              "h-7 w-7",
              isVoiceEnabled && voice.isRecording
                ? "text-red-500 bg-red-500/10 animate-pulse"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={
              !isVoiceEnabled
                ? t("hermes.chat.voiceNotConfigured", {
                    defaultValue: "语音输入未启用，请先在设置中配置",
                  })
                : voice.isRecording
                  ? t("hermes.chat.voiceStop", {
                      defaultValue: "停止录音并转写",
                    })
                  : voice.isBusy
                    ? t("hermes.chat.voiceTranscribing", {
                        defaultValue: "正在转写...",
                      })
                    : t("hermes.chat.voiceStart", { defaultValue: "语音输入" })
            }
          >
            {isVoiceEnabled && voice.isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleAttach}
            disabled={disabled || isStreaming}
            className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
            title={t("hermes.chat.attachFile")}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          {skillList.length > 0 && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowSkillPanel((v) => !v)}
              disabled={disabled}
              className={cn(
                "h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground",
                showSkillPanel && "text-primary bg-primary/10",
              )}
              title="技能列表"
            >
              <Zap className="w-4 h-4" />
            </Button>
          )}
          {onTogglePreview && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onTogglePreview}
              disabled={disabled}
              className={cn(
                "h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground",
                isPreviewOpen && "text-primary",
              )}
              title="预览 Markdown"
            >
              {isPreviewOpen ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
          )}
          <div className="flex-1 flex flex-wrap items-center gap-1 min-w-0">
            {files.map((f, i) => (
              <div
                key={`${f.filename}-${i}`}
                className="flex items-center gap-1 bg-muted rounded px-2 py-0.5 text-xs"
              >
                {f.mimeType?.startsWith("image/") && f.content && (
                  <img
                    src={`data:${f.mimeType};base64,${f.content}`}
                    alt={f.filename}
                    className="h-5 w-5 object-cover rounded flex-shrink-0"
                  />
                )}
                <span className="truncate max-w-[120px]">{f.filename}</span>
                <span className="text-muted-foreground">
                  ({formatSize(f.sizeBytes)})
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="hover:text-destructive ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={onStop}
              disabled={isStopping}
              className="h-8 w-8"
              title={isStopping ? "停止中..." : "停止"}
            >
              {isStopping ? (
                <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={disabled}
              className="h-8 w-8"
              title={t("hermes.chat.send")}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
