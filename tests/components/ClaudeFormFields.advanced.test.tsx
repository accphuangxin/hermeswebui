import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { describe, expect, it, vi } from "vitest";
import { ClaudeFormFields } from "@/components/providers/forms/ClaudeFormFields";

vi.mock("@/lib/api/model-fetch", () => ({
  fetchModelsForConfig: vi.fn().mockResolvedValue([]),
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
  claudeModel: "deepseek/deepseek-flash",
  defaultHaikuModel: "deepseek/deepseek-flash",
  defaultSonnetModel: "deepseek/deepseek-flash",
  defaultOpusModel: "deepseek-v4.1-flash",
  defaultFableModel: "kimi-k3",
  subagentModel: "deepseek/deepseek-flash",
  defaultHaikuModelName: "deepseek/deepseek-flash",
  defaultSonnetModelName: "deepseek/deepseek-flash",
  defaultOpusModelName: "deepseek-v4.1-flash",
  defaultFableModelName: "kimi-k3",
  onModelChange: vi.fn(),
  speedTestEndpoints: [],
  apiFormat: "openai_chat" as const,
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
}: {
  onModelChange?: (field: string, value: string) => void;
} = {}) {
  const form = useForm({ defaultValues: { name: "", websiteUrl: "" } });
  return (
    <Form {...form}>
      <ClaudeFormFields
        {...baseProps}
        onModelChange={onModelChange ?? baseProps.onModelChange}
      />
    </Form>
  );
}

describe("ClaudeFormFields 高级选项", () => {
  it("渲染模型映射角色行与兜底模型 / User-Agent 分组", () => {
    render(<Harness />);

    // 有高级值 → 默认展开
    expect(screen.getByLabelText("上游格式")).toBeTruthy();
    expect(screen.getByText("认证字段")).toBeTruthy();
    expect(screen.getByText("模型角色")).toBeTruthy();
    expect(screen.getByText("显示名称")).toBeTruthy();
    expect(screen.getByText("实际请求模型")).toBeTruthy();
    expect(screen.getByText("声明支持 1M")).toBeTruthy();

    for (const role of ["Sonnet", "Opus", "Fable", "Haiku", "Subagent"]) {
      expect(screen.getByText(role)).toBeTruthy();
    }

    expect(screen.getByText("不显示在 /model 菜单")).toBeTruthy();
    expect(screen.getByLabelText("默认兜底模型")).toBeTruthy();
    expect(screen.getByLabelText("自定义 User-Agent")).toBeTruthy();
    expect(screen.getByText("本地代理请求覆盖")).toBeTruthy();
  });

  it("勾选 1M 时给对应模型写入声明后缀", () => {
    const onModelChange = vi.fn();
    render(<Harness onModelChange={onModelChange} />);

    // 第一行（Sonnet）的 1M 复选框
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    expect(onModelChange).toHaveBeenCalledWith(
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "deepseek/deepseek-flash[1M]",
    );
  });
});
