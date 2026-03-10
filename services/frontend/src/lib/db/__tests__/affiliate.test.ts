import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getSupabaseAdmin } from "../supabase";
import {
  getAffiliateMemberByUserId,
  getAffiliateMemberByCode,
  createAffiliateMember,
  createAffiliateReferral,
  getAffiliateReferralByUser,
  updateAffiliateReferralStatus,
  getAffiliateStats,
} from "../affiliate";

type MockResult = { data?: any; error?: any; count?: any };

function createMockSupabase(
  result: MockResult,
  resolveOn: "single" | "eq" = "single"
) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  if (resolveOn === "eq") {
    chain.eq = vi.fn().mockResolvedValue(result);
  }
  return chain;
}

const mockMember = {
  id: 1,
  user_id: 42,
  affiliate_code: "ABCD1234",
  status: "active" as const,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const mockReferral = {
  id: 10,
  affiliate_member_id: 1,
  referred_user_id: 99,
  affiliate_code: "ABCD1234",
  status: "registered" as const,
  created_at: "2025-02-01T00:00:00Z",
  updated_at: "2025-02-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getAffiliateMemberByUserId", () => {
  it("returns member when found", async () => {
    const chain = createMockSupabase({ data: mockMember, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getAffiliateMemberByUserId(42);
    expect(result).toEqual(mockMember);
    expect(chain.from).toHaveBeenCalledWith("affiliate_members");
    expect(chain.eq).toHaveBeenCalledWith("user_id", 42);
  });

  it("returns null on PGRST116", async () => {
    const chain = createMockSupabase({
      data: null,
      error: { code: "PGRST116" },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getAffiliateMemberByUserId(999);
    expect(result).toBeNull();
  });
});

describe("getAffiliateMemberByCode", () => {
  it("returns member when found", async () => {
    const chain = createMockSupabase({ data: mockMember, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getAffiliateMemberByCode("abcd1234");
    expect(result).toEqual(mockMember);
    expect(chain.eq).toHaveBeenCalledWith("affiliate_code", "ABCD1234");
    expect(chain.eq).toHaveBeenCalledWith("status", "active");
  });

  it("returns null on PGRST116", async () => {
    const chain = createMockSupabase({
      data: null,
      error: { code: "PGRST116" },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getAffiliateMemberByCode("MISSING");
    expect(result).toBeNull();
  });
});

describe("createAffiliateMember", () => {
  it("returns member on first success with valid affiliate code", async () => {
    const chain = createMockSupabase({ data: mockMember, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await createAffiliateMember(42);
    expect(result).toEqual(mockMember);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 42,
        affiliate_code: expect.stringMatching(/^[A-Z0-9]{8}$/),
      })
    );
    expect(getSupabaseAdmin).toHaveBeenCalledTimes(1);
  });

  it("retries on 23505 error then succeeds", async () => {
    const chain = createMockSupabase({ data: null, error: null });
    chain.single = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({ data: mockMember, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await createAffiliateMember(42);
    expect(result).toEqual(mockMember);
    expect(chain.single).toHaveBeenCalledTimes(2);
  });

  it("throws after 2 failed 23505 attempts", async () => {
    const error23505 = { code: "23505", message: "unique violation" };
    const chain = createMockSupabase({ data: null, error: null });
    chain.single = vi.fn()
      .mockResolvedValueOnce({ data: null, error: error23505 })
      .mockResolvedValueOnce({ data: null, error: error23505 });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await expect(createAffiliateMember(42)).rejects.toEqual(error23505);
    expect(chain.single).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-23505 error", async () => {
    const dbError = { code: "42P01", message: "relation does not exist" };
    const chain = createMockSupabase({ data: null, error: dbError });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await expect(createAffiliateMember(42)).rejects.toEqual(dbError);
    expect(chain.single).toHaveBeenCalledTimes(1);
  });
});

describe("createAffiliateReferral", () => {
  it("returns referral on success", async () => {
    const chain = createMockSupabase({ data: mockReferral, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await createAffiliateReferral({
      affiliateMemberId: 1,
      referredUserId: 99,
      affiliateCode: "ABCD1234",
    });
    expect(result).toEqual(mockReferral);
    expect(chain.from).toHaveBeenCalledWith("affiliate_referrals");
    expect(chain.insert).toHaveBeenCalledWith({
      affiliate_member_id: 1,
      referred_user_id: 99,
      affiliate_code: "ABCD1234",
    });
  });

  it("throws on error", async () => {
    const dbError = { code: "23503", message: "foreign key violation" };
    const chain = createMockSupabase({ data: null, error: dbError });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await expect(
      createAffiliateReferral({
        affiliateMemberId: 1,
        referredUserId: 99,
        affiliateCode: "ABCD1234",
      })
    ).rejects.toEqual(dbError);
  });
});

describe("getAffiliateReferralByUser", () => {
  it("returns referral when found", async () => {
    const chain = createMockSupabase({ data: mockReferral, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getAffiliateReferralByUser(99);
    expect(result).toEqual(mockReferral);
    expect(chain.eq).toHaveBeenCalledWith("referred_user_id", 99);
  });

  it("returns null on PGRST116", async () => {
    const chain = createMockSupabase({
      data: null,
      error: { code: "PGRST116" },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getAffiliateReferralByUser(999);
    expect(result).toBeNull();
  });
});

describe("updateAffiliateReferralStatus", () => {
  it("calls update successfully", async () => {
    const chain = createMockSupabase({ error: null }, "eq");
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await updateAffiliateReferralStatus(10, "subscribed");
    expect(chain.from).toHaveBeenCalledWith("affiliate_referrals");
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "subscribed" })
    );
    expect(chain.eq).toHaveBeenCalledWith("id", 10);
  });

  it("throws on error", async () => {
    const dbError = { code: "42P01", message: "relation does not exist" };
    const chain = createMockSupabase({ error: dbError }, "eq");
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    await expect(
      updateAffiliateReferralStatus(10, "subscribed")
    ).rejects.toEqual(dbError);
  });
});

describe("getAffiliateStats", () => {
  it("returns null when member not found", async () => {
    const chain = createMockSupabase({
      data: null,
      error: { code: "PGRST116" },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(chain as any);

    const result = await getAffiliateStats(999);
    expect(result).toBeNull();
  });

  it("returns correct totalReferrals count and referralsByMonth grouping", async () => {
    const memberChain = createMockSupabase({
      data: mockMember,
      error: null,
    });
    const referrals = [
      { id: 1, created_at: "2025-01-15T00:00:00Z" },
      { id: 2, created_at: "2025-01-20T00:00:00Z" },
      { id: 3, created_at: "2025-02-10T00:00:00Z" },
    ];
    const referralsChain = createMockSupabase(
      { data: referrals, error: null },
      "eq"
    );
    vi.mocked(getSupabaseAdmin)
      .mockReturnValueOnce(memberChain as any)
      .mockReturnValueOnce(referralsChain as any);

    const result = await getAffiliateStats(42);
    expect(result).toEqual({
      totalReferrals: 3,
      referralsByMonth: {
        "2025-01": 2,
        "2025-02": 1,
      },
    });
  });

  it("handles empty referrals list", async () => {
    const memberChain = createMockSupabase({
      data: mockMember,
      error: null,
    });
    const referralsChain = createMockSupabase(
      { data: [], error: null },
      "eq"
    );
    vi.mocked(getSupabaseAdmin)
      .mockReturnValueOnce(memberChain as any)
      .mockReturnValueOnce(referralsChain as any);

    const result = await getAffiliateStats(42);
    expect(result).toEqual({
      totalReferrals: 0,
      referralsByMonth: {},
    });
  });
});
