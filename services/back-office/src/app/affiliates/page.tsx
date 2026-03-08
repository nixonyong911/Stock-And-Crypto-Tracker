"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  ChevronDown,
  ChevronRight,
  Calendar,
  UserPlus,
  Hash,
} from "lucide-react";

interface Referral {
  id: number;
  referredUser: { email: string; displayName: string };
  status: string;
  createdAt: string;
}

interface Affiliate {
  id: number;
  affiliateCode: string;
  status: string;
  createdAt: string;
  promoter: { email: string; displayName: string };
  referralCount: number;
  referrals: Referral[];
}

interface AffiliateData {
  affiliates: Affiliate[];
  summary: {
    totalAffiliates: number;
    totalReferrals: number;
    month: string;
  };
}

export default function AffiliatesPage() {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const params = month ? `?month=${month}` : "";
        const res = await fetch(`/back-office/api/affiliates${params}`);
        if (res.ok) {
          setData(await res.json());
        } else {
          setData(null);
        }
      } catch (err) {
        console.error("Failed to fetch affiliates:", err);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [month]);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Affiliate Program</h1>
          <p className="text-slate-400 mt-1">
            Promoters, referrals, and program stats
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">
                Total Affiliates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                <span className="text-2xl font-bold text-slate-100">
                  {loading
                    ? "—"
                    : data?.summary?.totalAffiliates ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400">
                Referrals
                {data?.summary?.month && data.summary.month !== "all"
                  ? ` (${data.summary.month})`
                  : " (all time)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <span className="text-2xl font-bold text-emerald-400">
                  {loading
                    ? "—"
                    : data?.summary?.totalReferrals ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Month Filter */}
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-slate-500" />
          <label htmlFor="month-filter" className="text-sm text-slate-400">
            Filter by month:
          </label>
          <input
            id="month-filter"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          {month && (
            <button
              type="button"
              onClick={() => setMonth("")}
              className="text-sm text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>

        {/* Affiliates Table */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Affiliates</CardTitle>
            <CardDescription className="text-slate-400">
              Promoters and their referrals
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-slate-500">
                Loading affiliates...
              </div>
            ) : !data?.affiliates?.length ? (
              <div className="text-center py-12 text-slate-500">
                No affiliates found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-sm text-slate-400">
                      <th className="pb-3 pr-4 w-8" />
                      <th className="pb-3 pr-4">Promoter</th>
                      <th className="pb-3 pr-4">Affiliate Code</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Referrals</th>
                      <th className="pb-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.affiliates.map((aff) => (
                      <React.Fragment key={aff.id}>
                        <tr
                          key={aff.id}
                          className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3 pr-4">
                            <button
                              type="button"
                              onClick={() => toggleRow(aff.id)}
                              className="p-0.5 rounded hover:bg-slate-700"
                              aria-label={
                                expandedRows.has(aff.id)
                                  ? "Collapse"
                                  : "Expand"
                              }
                            >
                              {expandedRows.has(aff.id) ? (
                                <ChevronDown className="w-4 h-4 text-slate-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 pr-4">
                            <div>
                              <div className="font-medium text-slate-200">
                                {aff.promoter.displayName || "—"}
                              </div>
                              <div className="text-sm text-slate-500">
                                {aff.promoter.email || "—"}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center gap-1 font-mono text-sm text-cyan-400">
                              <Hash className="w-3.5 h-3.5" />
                              {aff.affiliateCode}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                aff.status === "active"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : aff.status === "suspended"
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "bg-slate-500/20 text-slate-400"
                              }`}
                            >
                              {aff.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-slate-200">
                              {aff.referralCount}
                            </span>
                          </td>
                          <td className="py-3 text-slate-400 text-sm">
                            {formatDate(aff.createdAt)}
                          </td>
                        </tr>
                        {expandedRows.has(aff.id) &&
                          aff.referrals.length > 0 && (
                            <tr
                              key={`${aff.id}-expanded`}
                              className="bg-slate-950/50"
                            >
                              <td colSpan={6} className="py-3 px-4">
                                <div className="pl-8 space-y-2">
                                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                                    Referrals
                                  </div>
                                  {aff.referrals.map((ref) => (
                                    <div
                                      key={ref.id}
                                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-900/80 border border-slate-800"
                                    >
                                      <div>
                                        <span className="text-slate-200">
                                          {ref.referredUser.displayName ||
                                            ref.referredUser.email ||
                                            "—"}
                                        </span>
                                        {ref.referredUser.displayName &&
                                          ref.referredUser.email && (
                                            <span className="text-slate-500 text-sm ml-2">
                                              {ref.referredUser.email}
                                            </span>
                                          )}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span
                                          className={`text-xs px-2 py-0.5 rounded ${
                                            ref.status === "subscribed"
                                              ? "bg-emerald-500/20 text-emerald-400"
                                              : ref.status === "churned"
                                                ? "bg-red-500/20 text-red-400"
                                                : "bg-slate-500/20 text-slate-400"
                                          }`}
                                        >
                                          {ref.status}
                                        </span>
                                        <span className="text-slate-500 text-xs">
                                          {formatDate(ref.createdAt)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        {expandedRows.has(aff.id) &&
                          aff.referrals.length === 0 && (
                            <tr
                              key={`${aff.id}-expanded-empty`}
                              className="bg-slate-950/50"
                            >
                              <td colSpan={6} className="py-3 px-4">
                                <div className="pl-8 text-sm text-slate-500">
                                  No referrals
                                  {month ? ` in ${month}` : ""}
                                </div>
                              </td>
                            </tr>
                          )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
