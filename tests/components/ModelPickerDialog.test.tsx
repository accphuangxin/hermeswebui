import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelPickerDialog } from "@/components/providers/forms/shared/ModelPickerDialog";

const models = [
  { id: "doubao-seed-2-0-lite-260428", ownedBy: "doubao" },
  { id: "minimax-m3", ownedBy: "minimax" },
  { id: "kimi-k3", ownedBy: "moonshot" },
];

describe("ModelPickerDialog", () => {
  it("勾选后按列表顺序回传模型 ID", () => {
    const onConfirm = vi.fn();
    render(
      <ModelPickerDialog
        open
        onOpenChange={vi.fn()}
        models={models}
        onConfirm={onConfirm}
      />,
    );

    // 先勾 kimi-k3，再勾 doubao：回传顺序仍按列表
    fireEvent.click(screen.getByText("kimi-k3"));
    fireEvent.click(screen.getByText("doubao-seed-2-0-lite-260428"));
    fireEvent.click(screen.getByRole("button", { name: /添加所选/ }));

    expect(onConfirm).toHaveBeenCalledWith([
      "doubao-seed-2-0-lite-260428",
      "kimi-k3",
    ]);
  });

  it("搜索时只显示匹配的模型", () => {
    render(
      <ModelPickerDialog
        open
        onOpenChange={vi.fn()}
        models={models}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("搜索模型"), {
      target: { value: "kimi" },
    });

    expect(screen.getByText("kimi-k3")).toBeTruthy();
    expect(screen.queryByText("minimax-m3")).toBeNull();
  });

  it("超过可选上限时不再允许勾选", () => {
    const onConfirm = vi.fn();
    render(
      <ModelPickerDialog
        open
        onOpenChange={vi.fn()}
        models={models}
        maxSelectable={1}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText("minimax-m3"));
    fireEvent.click(screen.getByText("kimi-k3"));
    fireEvent.click(screen.getByRole("button", { name: /添加所选/ }));

    expect(onConfirm).toHaveBeenCalledWith(["minimax-m3"]);
  });

  it("打开时预勾选传入的模型，确认后回传预勾选结果", () => {
    const onConfirm = vi.fn();
    render(
      <ModelPickerDialog
        open
        onOpenChange={vi.fn()}
        models={models}
        initialSelectedIds={["kimi-k3", "not-in-list"]}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /添加所选/ }));

    // 不在返回列表里的 ID 会被忽略
    expect(onConfirm).toHaveBeenCalledWith(["kimi-k3"]);
  });
});
