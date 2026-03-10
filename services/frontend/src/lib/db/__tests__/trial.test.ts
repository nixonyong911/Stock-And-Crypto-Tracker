import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getSupabaseAdmin } from "../supabase";
import {
  hashPhone,
  getTrialClaimByPhoneHash,
  getTrialClaimByUserId,
  insertTrialClaim,
  countTrialClaimsByIp,
} from "../trial";

function createMockSupabase(result: { data?: any; error?: any; count?: any }) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  if (result.count !== undefined) {
    chain.gte = vi.fn().mockResolvedValue(result);
  }
  return chain;
}

const mockClaim = {
  id: 1,
  user_id: 42,
  phone_hash: "abc123",
  telegram_user_id: null,
  stripe_subscription_id: "sub_123",
  claimed_at: "2025-01-01T00:00:00Z",
  trial_end_at: "2025-01-08T00:00:00Z",
  source: "web" as const,
  ip_address: "1.2.3.4",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PHONE_HASH_SALT = "test-salt";
});

describe("hashPhone", () => {
  it("returns consistent hash for same input", () => {
    const hash1 = hashPhone("+15551234567");
    const hash2 = hashPhone("+15551234567");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("normalizes spaces, dashes, and parens", () => {
    const hash1 = hashPhone("+1 (555) 123-4567");
    const hash2 = hashPhone("+15551234567");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different numbers", () => {
    const hash1 = hashPhone("+15551234567");
    const hash2 = hashPhone("+15559876543");
    expect(hash1).not.toBe(hash2);
  });

  it("throws when PHONE_HASH_SALT is missing", () => {
    delete process.env.PHONE_HASH_SALT;
    expect(() => hashPhone("+15551234567")).toThrow(
      "PHONE_HASH_SALT is not configured"
    );
  });
});

describe("getTrialClaimByPhoneHash", () => {
  it("returns claim when found", async () => {
    const chain = createMockSupabase({ data: mockClaim, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getTrialClaimByPhoneHash("abc123");
    expect(result).toEqual(mockClaim);
    expect(chain.from).toHaveBeenCalledWith("trial_claims");
    expect(chain.eq).toHaveBeenCalledWith("phone_hash", "abc123");
  });

  it("returns null when error code is PGRST116", async () => {
    const chain = createMockSupabase({
      data: null,
      error: { code: "PGRST116" },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getTrialClaimByPhoneHash("missing");
    expect(result).toBeNull();
  });

  it("throws on unexpected error", async () => {
    const dbError = { code: "XXXXX", message: "connection failed" };
    const chain = createMockSupabase({ data: null, error: dbError });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await expect(getTrialClaimByPhoneHash("abc")).rejects.toEqual(dbError);
  });
});

describe("getTrialClaimByUserId", () => {
  it("returns claim when found", async () => {
    const chain = createMockSupabase({ data: mockClaim, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getTrialClaimByUserId(42);
    expect(result).toEqual(mockClaim);
    expect(chain.eq).toHaveBeenCalledWith("user_id", 42);
  });

  it("returns null on PGRST116", async () => {
    const chain = createMockSupabase({
      data: null,
      error: { code: "PGRST116" },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getTrialClaimByUserId(999);
    expect(result).toBeNull();
  });

  it("throws on unexpected error", async () => {
    const dbError = { code: "42P01", message: "relation does not exist" };
    const chain = createMockSupabase({ data: null, error: dbError });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await expect(getTrialClaimByUserId(42)).rejects.toEqual(dbError);
  });
});

describe("insertTrialClaim", () => {
  const claimInput = {
    user_id: 42,
    phone_hash: "abc123",
    stripe_subscription_id: "sub_123",
    trial_end_at: "2025-01-08T00:00:00Z",
    source: "web" as const,
  };

  it("returns inserted claim on success", async () => {
    const chain = createMockSupabase({ data: mockClaim, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await insertTrialClaim(claimInput);
    expect(result).toEqual(mockClaim);
    expect(chain.from).toHaveBeenCalledWith("trial_claims");
    expect(chain.insert).toHaveBeenCalledWith(claimInput);
  });

  it("throws on Supabase error", async () => {
    const dbError = { code: "23505", message: "duplicate key" };
    const chain = createMockSupabase({ data: null, error: dbError });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await expect(insertTrialClaim(claimInput)).rejects.toEqual(dbError);
  });
});

describe("countTrialClaimsByIp", () => {
  it("returns count when found", async () => {
    const chain = createMockSupabase({ count: 5, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await countTrialClaimsByIp("1.2.3.4");
    expect(result).toBe(5);
    expect(chain.from).toHaveBeenCalledWith("trial_claims");
    expect(chain.eq).toHaveBeenCalledWith("ip_address", "1.2.3.4");
  });

  it("uses 30-day default window", async () => {
    const now = new Date("2025-06-15T12:00:00Z").getTime();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now);
    const chain = createMockSupabase({ count: 0, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await countTrialClaimsByIp("1.2.3.4");

    const expectedSince = new Date(
      now - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(chain.gte).toHaveBeenCalledWith("claimed_at", expectedSince);
    spy.mockRestore();
  });

  it("custom withinDays parameter works", async () => {
    const now = new Date("2025-06-15T12:00:00Z").getTime();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now);
    const chain = createMockSupabase({ count: 2, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await countTrialClaimsByIp("1.2.3.4", 7);
    expect(result).toBe(2);

    const expectedSince = new Date(
      now - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(chain.gte).toHaveBeenCalledWith("claimed_at", expectedSince);
    spy.mockRestore();
  });

  it("returns 0 when count is null", async () => {
    const chain = createMockSupabase({ count: null, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await countTrialClaimsByIp("1.2.3.4");
    expect(result).toBe(0);
  });
});
