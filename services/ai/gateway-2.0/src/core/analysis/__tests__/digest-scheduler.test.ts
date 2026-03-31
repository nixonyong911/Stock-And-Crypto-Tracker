import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import cron from "node-cron";
import { startDigestScheduler, type DigestSchedulerDeps } from "../digest-scheduler.js";

vi.mock("../daily-overview-broadcaster.js", () => ({
  broadcastDailyOverview: vi.fn().mockResolvedValue({}),
}));

vi.mock("../memory-curator.js", () => ({
  runDailyMemoryMaintenance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../news-processor.js", () => ({
  processUnfilteredNews: vi.fn().mockResolvedValue({
    batchId: "test",
    inputArticles: 0,
    outputStories: 0,
    highImpact: 0,
    processingTimeMs: 0,
  }),
}));

function makeDeps(overrides?: Partial<DigestSchedulerDeps>): DigestSchedulerDeps {
  return {
    db: {} as DigestSchedulerDeps["db"],
    redis: {} as DigestSchedulerDeps["redis"],
    extensions: {} as DigestSchedulerDeps["extensions"],
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as DigestSchedulerDeps["log"],
    ...overrides,
  };
}

describe("startDigestScheduler", () => {
  let scheduleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scheduleSpy = vi.spyOn(cron, "schedule");
    const mockTask = { stop: vi.fn() };
    scheduleSpy.mockReturnValue(mockTask as unknown as cron.ScheduledTask);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the news processing cron at every-6h schedule", () => {
    const deps = makeDeps();
    startDigestScheduler(deps);

    const cronExpressions = scheduleSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(cronExpressions).toContain("0 */6 * * *");
  });

  it("registers all four scheduled jobs", () => {
    const deps = makeDeps();
    startDigestScheduler(deps);

    expect(scheduleSpy).toHaveBeenCalledTimes(4);

    const expressions = scheduleSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(expressions).toContain("0 12 * * 1-5");   // morning
    expect(expressions).toContain("0 22 * * 1-5");   // evening
    expect(expressions).toContain("0 4 * * *");       // memory maintenance
    expect(expressions).toContain("0 */6 * * *");     // news processing
  });

  it("passes curatorModel and telegramNotify to news processing job", async () => {
    const { processUnfilteredNews } = await import("../news-processor.js");
    const telegramNotify = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ curatorModel: "test-model", telegramNotify });
    startDigestScheduler(deps);

    const newsCall = scheduleSpy.mock.calls.find((call: unknown[]) => call[0] === "0 */6 * * *");
    expect(newsCall).toBeDefined();

    const callback = newsCall![1] as () => void;
    callback();

    await vi.waitFor(() => {
      expect(processUnfilteredNews).toHaveBeenCalledWith(
        expect.objectContaining({
          curatorModel: "test-model",
          telegramNotify,
        }),
      );
    });
  });

  it("stop() halts all four jobs", () => {
    const deps = makeDeps();
    const scheduler = startDigestScheduler(deps);

    scheduler.stop();

    for (const call of scheduleSpy.mock.results) {
      const task = call.value as { stop: ReturnType<typeof vi.fn> };
      expect(task.stop).toHaveBeenCalled();
    }
  });

  it("all cron jobs use UTC timezone", () => {
    const deps = makeDeps();
    startDigestScheduler(deps);

    for (const call of scheduleSpy.mock.calls) {
      const options = call[2] as { timezone?: string } | undefined;
      expect(options?.timezone).toBe("UTC");
    }
  });
});
