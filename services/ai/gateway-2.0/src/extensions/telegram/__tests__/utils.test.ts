import { describe, it, expect, vi } from "vitest";
import { notifyError } from "../utils.js";
import type { TelegramBotContext } from "../bot.js";

function createMockCtx(overrides?: {
  username?: string;
  firstName?: string;
  messageText?: string;
  updateId?: number;
}) {
  const replyFn = vi.fn().mockResolvedValue(undefined);
  const notifyFn = vi.fn().mockResolvedValue(undefined);

  const ctx = {
    from: {
      id: 12345,
      username: overrides?.username ?? "testuser",
      first_name: overrides?.firstName ?? "Test",
    },
    message: { text: overrides?.messageText ?? "Hi" },
    callbackQuery: undefined,
    update: { update_id: overrides?.updateId ?? 999 },
    reply: replyFn,
    gatewayAPI: {
      errorNotifier: { notify: notifyFn },
    },
  } as unknown as TelegramBotContext;

  return { ctx, replyFn, notifyFn };
}

describe("notifyError", () => {
  it("sends admin notification with user, message, and hint", async () => {
    const { ctx, notifyFn, replyFn } = createMockCtx();
    const err = new Error("DB connection lost");

    await notifyError(ctx, err, "Message — Pairing check failed");

    expect(notifyFn).toHaveBeenCalledOnce();
    const [notifiedErr, notifiedCtx] = notifyFn.mock.calls[0]!;
    expect(notifiedErr).toBe(err);
    expect(notifiedCtx).toEqual({
      type: "TelegramBotError: Message — Pairing check failed",
      user: "@testuser",
      userMessage: "Hi",
      updateId: 999,
    });

    expect(replyFn).toHaveBeenCalledWith(
      "⚠️ Something went wrong. Please try again."
    );
  });

  it("uses custom userReply when provided", async () => {
    const { ctx, replyFn } = createMockCtx();

    await notifyError(
      ctx,
      new Error("oops"),
      "/add — failed",
      "Something went wrong. Please try again later."
    );

    expect(replyFn).toHaveBeenCalledWith(
      "Something went wrong. Please try again later."
    );
  });

  it("falls back to first_name when username is absent", async () => {
    const { ctx, notifyFn } = createMockCtx({ username: undefined });
    (ctx.from as { username?: string }).username = undefined;

    await notifyError(ctx, new Error("x"), "test hint");

    const [, notifiedCtx] = notifyFn.mock.calls[0]!;
    expect(notifiedCtx.user).toBe("Test");
  });

  it("wraps non-Error values into an Error", async () => {
    const { ctx, notifyFn } = createMockCtx();

    await notifyError(ctx, "string error", "some hint");

    const [notifiedErr] = notifyFn.mock.calls[0]!;
    expect(notifiedErr).toBeInstanceOf(Error);
    expect((notifiedErr as Error).message).toBe("string error");
  });

  it("wraps null/undefined error using hint as message", async () => {
    const { ctx, notifyFn } = createMockCtx();

    await notifyError(ctx, null, "Session load failed");

    const [notifiedErr] = notifyFn.mock.calls[0]!;
    expect(notifiedErr).toBeInstanceOf(Error);
    expect((notifiedErr as Error).message).toBe("Session load failed");
  });

  it("does not throw if reply fails", async () => {
    const { ctx, replyFn } = createMockCtx();
    replyFn.mockRejectedValueOnce(new Error("chat deleted"));

    await expect(
      notifyError(ctx, new Error("oops"), "test")
    ).resolves.toBeUndefined();
  });

  it("does not throw if errorNotifier is undefined", async () => {
    const { ctx } = createMockCtx();
    (ctx.gatewayAPI as { errorNotifier?: unknown }).errorNotifier = undefined;

    await expect(
      notifyError(ctx, new Error("oops"), "test")
    ).resolves.toBeUndefined();
  });

  it("uses callbackQuery data when message text is absent", async () => {
    const { ctx, notifyFn } = createMockCtx();
    (ctx as unknown as { message: undefined }).message = undefined;
    (ctx as unknown as { callbackQuery: { data: string } }).callbackQuery = {
      data: "tz:America/New_York",
    };

    await notifyError(ctx, new Error("x"), "callback hint");

    const [, notifiedCtx] = notifyFn.mock.calls[0]!;
    expect(notifiedCtx.userMessage).toBe("tz:America/New_York");
  });
});
