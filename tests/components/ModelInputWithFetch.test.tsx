import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ModelInputWithFetch } from "@/components/providers/forms/shared/ModelInputWithFetch";

// cmdk 在 jsdom 中会调用 scrollIntoView，这里补一个 no-op
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const models = [
  { id: "doubao-seed-2-0-lite-260428", ownedBy: "doubao" },
  { id: "kimi-k3", ownedBy: "moonshot" },
];

describe("ModelInputWithFetch 下拉框", () => {
  it("有拉取结果时渲染为下拉框，点选后回填模型 ID", async () => {
    const onChange = vi.fn();
    render(
      <ModelInputWithFetch
        id="model"
        value=""
        onChange={onChange}
        fetchedModels={models}
        isLoading={false}
      />,
    );

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    expect(await screen.findByText("doubao-seed-2-0-lite-260428")).toBeTruthy();
    fireEvent.click(screen.getByText("kimi-k3"));

    expect(onChange).toHaveBeenCalledWith("kimi-k3");
  });

  it("支持搜索过滤，且允许使用自定义模型名", async () => {
    const onChange = vi.fn();
    render(
      <ModelInputWithFetch
        id="model"
        value=""
        onChange={onChange}
        fetchedModels={models}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(await screen.findByPlaceholderText("搜索模型"), {
      target: { value: "kimi" },
    });

    expect(screen.queryByText("doubao-seed-2-0-lite-260428")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("搜索模型"), {
      target: { value: "my-custom-model" },
    });
    fireEvent.click(await screen.findByText(/my-custom-model/));

    expect(onChange).toHaveBeenCalledWith("my-custom-model");
  });

  it("无拉取结果时保持纯输入框", () => {
    render(
      <ModelInputWithFetch
        id="model"
        value="gpt-5"
        onChange={vi.fn()}
        fetchedModels={[]}
        isLoading={false}
      />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "gpt-5",
    );
  });
});
