import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ClaudeFormFields } from "@/components/providers/forms/ClaudeFormFields";

// 下拉框使用 cmdk，jsdom 下需要 scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const fetchModelsForConfig = vi.fn();

vi.mock("@/lib/api/model-fetch", () => ({
  fetchModelsForConfig: (...args: unknown[]) => fetchModelsForConfig(...args),
  showFetchModelsError: vi.fn(),
}));

vi.mock("@/lib/api/copilot", () => ({
  copilotGetModels: vi.fn().mockResolvedValue([]),
  copilotGetModelsForAccount: vi.fn().mockResolvedValue([]),
}));

const baseProps = {
  shouldShowApiKey: true,
  apiKey: "sk-test",
  onApiKeyChange: vi.fn(),
  category: "third_party" as const,
  shouldShowApiKeyLink: false,
  websiteUrl: "",
  templateValueEntries: [],
  templateValues: {},
  templatePresetName: "",
  onTemplateValueChange: vi.fn(),
  shouldShowSpeedTest: true,
  baseUrl: "https://api.example.com",
  onBaseUrlChange: vi.fn(),
  isEndpointModalOpen: false,
  onEndpointModalToggle: vi.fn(),
  autoSelect: true,
  onAutoSelectChange: vi.fn(),
  shouldShowModelSelector: true,
  claudeModel: "",
  defaultHaikuModel: "",
  defaultSonnetModel: "",
  defaultOpusModel: "",
  defaultFableModel: "",
  subagentModel: "",
  defaultHaikuModelName: "",
  defaultSonnetModelName: "",
  defaultOpusModelName: "",
  defaultFableModelName: "",
  onModelChange: vi.fn(),
  speedTestEndpoints: [],
  apiFormat: "anthropic" as const,
  onApiFormatChange: vi.fn(),
  apiKeyField: "ANTHROPIC_AUTH_TOKEN" as const,
  onApiKeyFieldChange: vi.fn(),
  isFullUrl: false,
  onFullUrlChange: vi.fn(),
  customUserAgent: "",
  onCustomUserAgentChange: vi.fn(),
  localProxyHeadersOverride: "",
  onLocalProxyHeadersOverrideChange: vi.fn(),
  localProxyBodyOverride: "",
  onLocalProxyBodyOverrideChange: vi.fn(),
  availableModels: [],
  onAvailableModelsChange: vi.fn(),
};

function Harness({
  onModelChange,
  apiFormat,
  onAvailableModelsChange,
}: {
  onModelChange: (field: string, value: string) => void;
  apiFormat?: "anthropic" | "openai_chat";
  onAvailableModelsChange?: (ids: string[]) => void;
}) {
  const form = useForm({ defaultValues: { name: "", websiteUrl: "" } });
  // 模拟 ProviderForm 的持久化状态：勾选结果回传给父组件后再生效
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  return (
    <Form {...form}>
      <ClaudeFormFields
        {...baseProps}
        apiFormat={apiFormat ?? baseProps.apiFormat}
        onModelChange={onModelChange}
        availableModels={availableModels}
        onAvailableModelsChange={(ids) => {
          setAvailableModels(ids);
          onAvailableModelsChange?.(ids);
        }}
      />
    </Form>
  );
}

describe("ClaudeFormFields 获取模型列表弹窗", () => {
  it("拉取后弹出勾选框，确认后按顺序填入模型角色", async () => {
    fetchModelsForConfig.mockResolvedValue([
      { id: "doubao-seed-2-0-lite-260428", ownedBy: "doubao" },
      { id: "kimi-k3", ownedBy: "moonshot" },
    ]);
    const onModelChange = vi.fn();
    // 有高级值时才默认展开，这里用非默认上游格式触发展开
    render(<Harness onModelChange={onModelChange} apiFormat="openai_chat" />);

    fireEvent.click(
      screen.getByRole("button", { name: /providerForm\.fetchModels/ }),
    );

    expect(await screen.findByText("选择要添加的模型")).toBeTruthy();

    fireEvent.click(screen.getByText("kimi-k3"));
    fireEvent.click(screen.getByText("doubao-seed-2-0-lite-260428"));
    fireEvent.click(screen.getByRole("button", { name: /添加所选/ }));

    await waitFor(() => {
      // 按服务端返回顺序：第 1 个 → Sonnet，第 2 个 → Opus
      expect(onModelChange).toHaveBeenCalledWith(
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "doubao-seed-2-0-lite-260428",
      );
      expect(onModelChange).toHaveBeenCalledWith(
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
        "kimi-k3",
      );
    });
  });

  it("勾选后实际请求模型的下拉框只列勾选过的模型", async () => {
    fetchModelsForConfig.mockResolvedValue([
      { id: "doubao-seed-2-0-lite-260428", ownedBy: "doubao" },
      { id: "kimi-k3", ownedBy: "moonshot" },
      { id: "minimax-m3", ownedBy: "minimax" },
    ]);
    render(<Harness onModelChange={vi.fn()} apiFormat="openai_chat" />);

    fireEvent.click(
      screen.getByRole("button", { name: /providerForm\.fetchModels/ }),
    );

    expect(await screen.findByText("选择要添加的模型")).toBeTruthy();
    // 只勾 kimi-k3
    fireEvent.click(screen.getByText("kimi-k3"));
    fireEvent.click(screen.getByRole("button", { name: /添加所选/ }));

    // 打开 Sonnet 行的「实际请求模型」下拉框
    const sonnetTrigger = document.getElementById(
      "claudeDefaultSonnetModel",
    ) as HTMLElement | null;
    expect(sonnetTrigger).toBeTruthy();
    fireEvent.click(sonnetTrigger!);

    expect(await screen.findByRole("option", { name: /kimi-k3/ })).toBeTruthy();
    // 未勾选的模型不应出现在下拉框里
    expect(screen.queryByText("doubao-seed-2-0-lite-260428")).toBeNull();
    expect(screen.queryByText("minimax-m3")).toBeNull();
  });

  it("已保存的勾选集合（meta.availableModels）重开面板即作为下拉候选", async () => {
    function PersistedHarness() {
      const form = useForm({ defaultValues: { name: "", websiteUrl: "" } });
      return (
        <Form {...form}>
          <ClaudeFormFields
            {...baseProps}
            apiFormat="openai_chat"
            availableModels={["kimi-k3", "glm-5.3-flashx"]}
            onAvailableModelsChange={vi.fn()}
          />
        </Form>
      );
    }
    render(<PersistedHarness />);

    const sonnetTrigger = document.getElementById(
      "claudeDefaultSonnetModel",
    ) as HTMLElement | null;
    expect(sonnetTrigger).toBeTruthy();
    fireEvent.click(sonnetTrigger!);

    expect(await screen.findByRole("option", { name: /kimi-k3/ })).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /glm-5\.3-flashx/ }),
    ).toBeTruthy();
  });
});
