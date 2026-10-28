import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";
import { ChatMessageBubble } from "@/components/chat/ChatMessage";
import type { ChatMessage } from "@/types";

const TAURI_ENDPOINT = "http://tauri.local";

function captureOpenExternal() {
  const opened: string[] = [];
  server.use(
    http.post(`${TAURI_ENDPOINT}/open_external`, async ({ request }) => {
      const body = (await request.json()) as { url: string };
      opened.push(body.url);
      return HttpResponse.json(true);
    }),
  );
  return opened;
}

function assistantMessage(content: string): ChatMessage {
  return {
    id: "m1",
    sessionId: "s1",
    role: "assistant",
    content,
    toolCalls: null,
    toolCallId: null,
    name: null,
    fileRefs: null,
    createdAt: 1_700_000_000_000,
  };
}

describe("ChatMessage 外链点击", () => {
  it("点击 markdown 链接会用系统浏览器打开", async () => {
    const opened = captureOpenExternal();
    const user = userEvent.setup();
    render(
      <ChatMessageBubble
        message={assistantMessage(
          "登录 [药九九](https://www.yyjzt.com) 完成验证",
        )}
      />,
    );

    await user.click(screen.getByRole("link", { name: "药九九" }));

    expect(opened).toEqual(["https://www.yyjzt.com"]);
  });

  it("点击 GFM 自动识别的裸地址也会用系统浏览器打开", async () => {
    const opened = captureOpenExternal();
    const user = userEvent.setup();
    render(
      <ChatMessageBubble
        message={assistantMessage(
          "1. 在弹出的窗口里登录药九九 (www.yyjzt.com)",
        )}
      />,
    );

    await user.click(screen.getByRole("link", { name: "www.yyjzt.com" }));

    expect(opened).toEqual(["http://www.yyjzt.com"]);
  });

  it("mailto 链接不会走 open_external", async () => {
    const opened = captureOpenExternal();
    const user = userEvent.setup();
    render(
      <ChatMessageBubble
        message={assistantMessage("联系 [支持](mailto:support@example.com)")}
      />,
    );

    await user.click(screen.getByRole("link", { name: "支持" }));

    expect(opened).toEqual([]);
  });
});
