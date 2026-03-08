---
name: implementing-affiliate-commission
description: Use when implementing affiliate commission tracking, adding promoter rewards, or modifying the affiliate program to pay commissions on referred user payments
---

# Implementing Affiliate Commission

## Overview

Add commission tracking to the existing affiliate program. When a referred user makes their first paid subscription payment, calculate a percentage-based commission for the affiliate promoter.

## Prerequisites

The affiliate program is already implemented with:
- `affiliate_members` table (user_id, affiliate_code, status)
- `affiliate_referrals` table (affiliate_member_id, referred_user_id, status)
- Stripe webhook processing in `checkout.session.completed` that creates referral records and applies a $5 coupon
- DB access layer at `services/frontend/src/lib/db/affiliate.ts`

## Implementation Steps

### 1. Database Migration

Create a new migration (next number after existing ones in `services/ai/gateway-2.0/migrations/`):

```sql
ALTER TABLE affiliate_referrals
    ADD COLUMN IF NOT EXISTS commission_rate    decimal(5,2) NOT NULL DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS commission_amount  decimal(10,2),
    ADD COLUMN IF NOT EXISTS commission_currency varchar(3) DEFAULT 'usd',
    ADD COLUMN IF NOT EXISTS first_payment_at   timestamptz;
```

### 2. Update DB Access Layer

File: `services/frontend/src/lib/db/affiliate.ts`

Add function:

```typescript
export async function updateReferralCommission(
  referralId: number,
  amount: number,
  currency: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("affiliate_referrals")
    .update({
      commission_amount: amount,
      commission_currency: currency,
      first_payment_at: new Date().toISOString(),
      status: "commission_earned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", referralId);
  if (error) throw error;
}
```

Update `getAffiliateStats` to include commission totals (sum of commission_amount).

### 3. Modify Stripe Webhook

File: `services/frontend/src/app/api/webhooks/stripe/route.ts`

In `handleInvoicePaid`, add after the existing payment logging:

```typescript
// Check if payer was referred and commission not yet calculated
const { data: referral } = await supabase
  .from("affiliate_referrals")
  .select("id, commission_rate")
  .eq("referred_user_id", user.id)
  .is("first_payment_at", null)
  .single();

if (referral && invoice.amount_paid > 0) {
  const commissionAmount = Math.round(invoice.amount_paid * referral.commission_rate) / 10000;
  await updateReferralCommission(referral.id, commissionAmount, invoice.currency);
  console.log(`Affiliate commission: $${commissionAmount} for referral ${referral.id}`);
}
```

Note: `invoice.amount_paid` is in cents. Commission calculation: `(amount_in_cents * rate / 100) / 100` to get dollars.

### 4. Update Referral Status Flow

Add status transitions to `affiliate_referrals.status`:
- `registered` -> user signed up with code
- `subscribed` -> first payment received (update in `handleInvoicePaid`)
- `commission_earned` -> commission calculated
- `commission_paid` -> commission paid out (manual, via back-office)

### 5. Back-office Updates

File: `services/back-office/src/app/affiliates/page.tsx`
- Add commission columns to the table (commission amount, status)
- Add a "Mark as Paid" button per referral for manual payout

File: `services/back-office/src/app/api/affiliates/route.ts`
- Include commission_amount and commission_currency in the response
- Add summary: total commissions earned, total paid out

### 6. Affiliate Page Updates

File: `services/frontend/src/app/[locale]/affiliate/affiliate-content.tsx`
- Show commission earned in the affiliate dashboard section
- Update benefits text from "coming soon" to actual commission percentage

File: `services/frontend/src/messages/en.json` and `zh.json`
- Update `affiliate.benefits.forPromoter` with actual commission text

## Key Files

- `services/ai/gateway-2.0/migrations/` (new migration)
- `services/frontend/src/lib/db/affiliate.ts` (add updateReferralCommission)
- `services/frontend/src/app/api/webhooks/stripe/route.ts` (modify handleInvoicePaid)
- `services/back-office/src/app/affiliates/page.tsx` (add commission columns)
- `services/back-office/src/app/api/affiliates/route.ts` (include commission data)
- `services/frontend/src/app/[locale]/affiliate/affiliate-content.tsx` (show commission)

## Common Mistakes

- Commission rate is stored per-referral so it can be changed globally without affecting existing referrals
- `invoice.amount_paid` is in cents (Stripe convention) -- convert properly
- Only calculate commission on the FIRST payment (check `first_payment_at IS NULL`)
- Trial invoices have `amount_paid = 0` -- skip those
- The existing $5 coupon means first payment is $14.99 not $19.99 -- commission is calculated on actual payment
