import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import type { Provider } from "@/types";
import {
  ProviderForm,
  type ProviderFormProps,
  type ProviderFormValues,
} from "@/components/providers/forms/ProviderForm";
import { openclawApi, providersApi, vscodeApi, type AppId } from "@/lib/api";

interface EditProviderDialogProps {
  open: boolean;
  provider: Provider | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    provider: Provider;
    originalId?: string;
  }) => Promise<void> | void;
  appId: AppId;
  isProxyTakeover?: boolean; // 代理接管模式下不读取 live（避免显示被接管后的代理配置）
}

export function EditProviderDialog({
  open,
  provider,
  onOpenChange,
  onSubmit,
  appId,
  isProxyTakeover = false,
}: EditProviderDialogProps) {
  const { t } = useTranslation();
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const providerId = provider?.id;

  // 每次打开面板递增加一（渲染期修正 state，React 会在绘制前同步重渲染），
  // 让上一次会话读到的 live 结果失效；关闭时面板仍在淡出，不能清空
  const [prevOpen, setPrevOpen] = useState(open);
  const [openSeq, setOpenSeq] = useState(0);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setOpenSeq((seq) => seq + 1);
    }
  }

  // 默认使用传入的 provider.settingsConfig；若当前编辑对象是"当前生效供应商"，则用实时配置（~/.claude/settings.json）作为初始值
  const [liveState, setLiveState] = useState<{
    key: string;
    settings: Record<string, unknown> | null;
  } | null>(null);

  // live 读取结果的归属键：只有与当前会话匹配时才算"已就绪"
  const liveKey = `${providerId ?? ""}|${appId}|${
    isProxyTakeover ? "takeover" : "direct"
  }|${openSeq}`;

  useEffect(() => {
    if (!open || !providerId) return;
    let cancelled = false;

    const loadLiveSettings = async (): Promise<Record<
      string,
      unknown
    > | null> => {
      // 代理接管模式：Live 配置已被代理改写，读取 live 会导致编辑界面展示代理地址/占位符等内容
      // 因此直接回退到 SSOT（数据库）配置，避免用户困惑与误保存
      if (isProxyTakeover) return null;

      // OpenCode uses additive mode - each provider's config is stored independently in DB
      // Reading live config would return the full opencode.json (with $schema, provider, mcp etc.)
      // instead of just the provider fragment, causing incorrect nested structure on save
      if (appId === "opencode") return null;

      if (appId === "openclaw") {
        try {
          const live = await openclawApi.getLiveProvider(providerId);
          return live && typeof live === "object"
            ? (live as Record<string, unknown>)
            : null;
        } catch {
          return null;
        }
      }

      try {
        const currentId = await providersApi.getCurrent(appId);
        if (!currentId || providerId !== currentId) return null;
        const live = (await vscodeApi.getLiveProviderSettings(appId)) as Record<
          string,
          unknown
        >;
        return live && typeof live === "object" ? live : null;
      } catch {
        // 读取实时配置失败则回退到 SSOT（不打断编辑流程）
        return null;
      }
    };

    void loadLiveSettings().then((settings) => {
      if (!cancelled) {
        setLiveState({ key: liveKey, settings });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, providerId, appId, isProxyTakeover, liveKey]);

  // 根因修复：live 配置读取完成前不挂载表单。
  // 之前先渲染数据库配置，等 live 到达后再整体替换，会让表单二次重置（闪动）。
  const isLiveSettled = liveState?.key === liveKey;
  const liveSettings = isLiveSettled ? liveState.settings : null;

  const initialSettingsConfig = useMemo(() => {
    return (liveSettings ?? provider?.settingsConfig ?? {}) as Record<
      string,
      unknown
    >;
  }, [liveSettings, provider?.settingsConfig]); // 只依赖 settingsConfig，不依赖整个 provider

  // 内容指纹：useProvidersQuery（路由运行中每 10s 刷新 + 窗口聚焦刷新）每次都会
  // 通过 getAll + sortProviders 返回全新的 Provider 对象。若按对象身份生成 initialData，
  // 会让 ProviderForm 的 form.reset 以及所有以 initialData 为依赖的 effect 反复触发，
  // 表现为编辑面板内容持续闪动。这里按内容判断是否真的变化，内容一致就复用上次的对象。
  const initialDataKey = useMemo(() => {
    if (!provider) return "";
    return JSON.stringify([
      provider.id,
      appId,
      openSeq,
      provider.name,
      provider.notes ?? null,
      provider.websiteUrl ?? null,
      provider.category ?? null,
      JSON.stringify(provider.meta ?? null),
      provider.icon ?? null,
      provider.iconColor ?? null,
      // live 配置优先，且按内容比较（settingsConfig 对象身份每次刷新都会变）
      JSON.stringify(liveSettings ?? provider.settingsConfig ?? null),
    ]);
  }, [provider, appId, openSeq, liveSettings]);

  const initialDataCacheRef = useRef<{
    key: string;
    data: NonNullable<ProviderFormProps["initialData"]>;
  } | null>(null);

  const initialData = useMemo<ProviderFormProps["initialData"] | null>(() => {
    if (!provider) return null;
    const cached = initialDataCacheRef.current;
    if (cached && cached.key === initialDataKey) {
      return cached.data;
    }
    const data = {
      name: provider.name,
      notes: provider.notes,
      websiteUrl: provider.websiteUrl,
      settingsConfig: initialSettingsConfig,
      category: provider.category,
      meta: provider.meta,
      icon: provider.icon,
      iconColor: provider.iconColor,
    };
    initialDataCacheRef.current = { key: initialDataKey, data };
    return data;
  }, [provider, initialSettingsConfig, initialDataKey]);

  const handleSubmit = useCallback(
    async (values: ProviderFormValues) => {
      if (!provider) return;

      // 注意：values.settingsConfig 已经是最终的配置字符串
      // ProviderForm 已经为不同的 app 类型（Claude/Codex/Gemini）正确组装了配置
      const parsedConfig = JSON.parse(values.settingsConfig) as Record<
        string,
        unknown
      >;
      const nextProviderId =
        (appId === "opencode" || appId === "openclaw") &&
        values.providerKey?.trim()
          ? values.providerKey.trim()
          : provider.id;

      const updatedProvider: Provider = {
        ...provider,
        id: nextProviderId,
        name: values.name.trim(),
        notes: values.notes?.trim() || undefined,
        websiteUrl: values.websiteUrl?.trim() || undefined,
        settingsConfig: parsedConfig,
        icon: values.icon?.trim() || undefined,
        iconColor: values.iconColor?.trim() || undefined,
        ...(values.presetCategory ? { category: values.presetCategory } : {}),
        // 保留或更新 meta 字段
        ...(values.meta ? { meta: values.meta } : {}),
      };

      await onSubmit({
        provider: updatedProvider,
        originalId: provider.id,
      });
      onOpenChange(false);
    },
    [appId, onSubmit, onOpenChange, provider],
  );

  if (!provider) {
    return null;
  }

  return (
    <FullScreenPanel
      isOpen={open}
      title={t("provider.editProvider")}
      onClose={() => onOpenChange(false)}
      footer={
        isLiveSettled ? (
          <Button
            type="submit"
            form="provider-form"
            disabled={isFormSubmitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-4 w-4 mr-2" />
            {t("common.save")}
          </Button>
        ) : undefined
      }
    >
      {/* 数据就绪前只显示占位：表单以最终初始值挂载一次，避免"数据库配置 → 实时文件配置"二次渲染造成闪动 */}
      {!isLiveSettled || !initialData ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : (
        <ProviderForm
          appId={appId}
          providerId={provider.id}
          submitLabel={t("common.save")}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          onSubmittingChange={setIsFormSubmitting}
          initialData={initialData}
          showButtons={false}
        />
      )}
    </FullScreenPanel>
  );
}
