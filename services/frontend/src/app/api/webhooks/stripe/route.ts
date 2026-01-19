import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, unixToDate, isActiveSubscription } from "@/lib/stripe/stripe";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { invalidateUserTierCache } from "@/lib/db/user-tier";

// Disable body parsing - we need the raw body for webhook verification
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("Stripe webhook: Missing signature");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Stripe webhook: Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook: Signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Check for duplicate event processing
  const { data: existingEvent } = await supabase
    .from("subscription_history")
    .select("id")
    .eq("stripe_event_id", event.id)
    .single();

  if (existingEvent) {
    console.log(`Stripe webhook: Duplicate event ${event.id}, skipping`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(supabase, subscription, event);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabase, subscription, event);
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleTrialWillEnd(supabase, subscription, event);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(supabase, invoice, event);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(supabase, invoice, event);
        break;
      }

      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        await handleCustomerCreated(supabase, customer, event);
        break;
      }

      default:
        console.log(`Stripe webhook: Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Stripe webhook: Error processing ${event.type}`, error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// Handle subscription created or updated
async function handleSubscriptionChange(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subscription: Stripe.Subscription,
  event: Stripe.Event
) {
  const customerId = subscription.customer as string;
  const subscriptionItem = subscription.items.data[0];
  const priceId = subscriptionItem?.price?.id;
  const productId = subscriptionItem?.price?.product as string;
  const interval = subscriptionItem?.price?.recurring?.interval || "month";

  // Find user by stripe_customer_id
  let { data: user } = await supabase
    .from("users")
    .select("id, tier")
    .eq("stripe_customer_id", customerId)
    .single();

  // Fallback: lookup by customer email if not found by ID
  if (!user) {
    console.log(`Stripe webhook: User not found by customer ID, trying email lookup...`);
    
    // Get customer email from Stripe
    const customer = await stripe.customers.retrieve(customerId);
    if (customer && !customer.deleted && customer.email) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id, tier")
        .eq("email", customer.email)
        .single();
      
      if (userByEmail) {
        user = userByEmail;
        
        // Link the customer ID to the user for future lookups
        await supabase
          .from("users")
          .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        
        console.log(`Stripe webhook: Linked customer ${customerId} to user ${user.id} via email`);
      }
    }
  }

  if (!user) {
    console.error(`Stripe webhook: No user found for customer ${customerId}`);
    return;
  }

  const previousStatus = await getCurrentSubscriptionStatus(supabase, user.id);

  // Upsert subscription record
  const { error: subscriptionError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: user.id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        stripe_product_id: productId,
        plan_type: "pro",
        status: subscription.status,
        interval: interval,
        current_period_start: subscriptionItem ? unixToDate(subscriptionItem.current_period_start)?.toISOString() : null,
        current_period_end: subscriptionItem ? unixToDate(subscriptionItem.current_period_end)?.toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at ? unixToDate(subscription.canceled_at)?.toISOString() : null,
        trial_start: subscription.trial_start ? unixToDate(subscription.trial_start)?.toISOString() : null,
        trial_end: subscription.trial_end ? unixToDate(subscription.trial_end)?.toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" }
    );

  if (subscriptionError) {
    console.error("Stripe webhook: Error upserting subscription", subscriptionError);
  }

  // Update user tier based on subscription status
  const newTier = isActiveSubscription(subscription.status) ? "pro" : "free";
  
  if (user.tier !== newTier) {
    const { error: tierError } = await supabase
      .from("users")
      .update({ tier: newTier, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (tierError) {
      console.error("Stripe webhook: Error updating user tier", tierError);
    }

    // Invalidate tier cache
    const { data: userData } = await supabase
      .from("users")
      .select("clerk_user_id")
      .eq("id", user.id)
      .single();

    if (userData?.clerk_user_id) {
      invalidateUserTierCache(userData.clerk_user_id);
    }
  }

  // Log to subscription_history
  await logSubscriptionHistory(supabase, user.id, subscription.id, event.type, previousStatus, subscription.status, event);

  console.log(`Stripe webhook: Subscription ${event.type} for user ${user.id}, status: ${subscription.status}`);
}

// Handle subscription deleted (ended)
async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subscription: Stripe.Subscription,
  event: Stripe.Event
) {
  const customerId = subscription.customer as string;

  const { data: user } = await supabase
    .from("users")
    .select("id, clerk_user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!user) {
    console.error(`Stripe webhook: No user found for customer ${customerId}`);
    return;
  }

  const previousStatus = await getCurrentSubscriptionStatus(supabase, user.id);

  // Update subscription status to canceled
  const { error: subscriptionError } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (subscriptionError) {
    console.error("Stripe webhook: Error updating subscription to canceled", subscriptionError);
  }

  // Downgrade user to free tier
  const { error: tierError } = await supabase
    .from("users")
    .update({ tier: "free", updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (tierError) {
    console.error("Stripe webhook: Error downgrading user tier", tierError);
  }

  // Invalidate tier cache
  if (user.clerk_user_id) {
    invalidateUserTierCache(user.clerk_user_id);
  }

  // Log to subscription_history
  await logSubscriptionHistory(supabase, user.id, subscription.id, "canceled", previousStatus, "canceled", event);

  console.log(`Stripe webhook: Subscription deleted for user ${user.id}`);
}

// Handle trial will end (3 days before)
async function handleTrialWillEnd(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subscription: Stripe.Subscription,
  event: Stripe.Event
) {
  const customerId = subscription.customer as string;

  const { data: user } = await supabase
    .from("users")
    .select("id, email")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!user) {
    console.error(`Stripe webhook: No user found for customer ${customerId}`);
    return;
  }

  // Log to subscription_history
  await logSubscriptionHistory(supabase, user.id, subscription.id, "trial_will_end", subscription.status, subscription.status, event);

  // TODO: Send notification to user about trial ending
  console.log(`Stripe webhook: Trial ending soon for user ${user.id}`);
}

// Handle successful payment
async function handleInvoicePaid(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  invoice: Stripe.Invoice,
  event: Stripe.Event
) {
  const customerId = invoice.customer as string;
  // Stripe SDK v20: subscription moved to parent.subscription_details
  const subscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;

  if (!subscriptionId) return; // Not a subscription invoice

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!user) return;

  // Log payment success
  await logSubscriptionHistory(supabase, user.id, subscriptionId, "payment_succeeded", null, null, event, {
    amount: invoice.amount_paid,
    currency: invoice.currency,
    invoice_id: invoice.id,
  });

  console.log(`Stripe webhook: Payment successful for user ${user.id}, amount: ${invoice.amount_paid}`);
}

// Handle failed payment
async function handlePaymentFailed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  invoice: Stripe.Invoice,
  event: Stripe.Event
) {
  const customerId = invoice.customer as string;
  // Stripe SDK v20: subscription moved to parent.subscription_details
  const subscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;

  if (!subscriptionId) return;

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!user) return;

  // Log payment failure
  await logSubscriptionHistory(supabase, user.id, subscriptionId, "payment_failed", null, null, event, {
    amount: invoice.amount_due,
    currency: invoice.currency,
    invoice_id: invoice.id,
    attempt_count: invoice.attempt_count,
  });

  // Note: We don't downgrade immediately - Stripe handles retry logic
  // The subscription status will change to past_due which we handle in subscription.updated

  console.log(`Stripe webhook: Payment failed for user ${user.id}, attempt: ${invoice.attempt_count}`);
}

// Handle customer created - link to existing user if email matches
async function handleCustomerCreated(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  customer: Stripe.Customer,
  event: Stripe.Event
) {
  if (!customer.email) return;

  // Try to find user by email and update stripe_customer_id
  const { error } = await supabase
    .from("users")
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq("email", customer.email)
    .is("stripe_customer_id", null);

  if (!error) {
    console.log(`Stripe webhook: Linked customer ${customer.id} to user with email ${customer.email}`);
  }
}

// Helper: Get current subscription status
async function getCurrentSubscriptionStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: number
): Promise<string | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .single();

  return data?.status || null;
}

// Helper: Log to subscription_history
async function logSubscriptionHistory(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: number,
  subscriptionId: string | null,
  eventType: string,
  previousStatus: string | null,
  newStatus: string | null,
  event: Stripe.Event,
  extraMetadata?: Record<string, unknown>
) {
  const { error } = await supabase.from("subscription_history").insert({
    user_id: userId,
    stripe_subscription_id: subscriptionId,
    event_type: eventType,
    previous_status: previousStatus,
    new_status: newStatus,
    metadata: JSON.stringify({
      stripe_event_type: event.type,
      stripe_event_created: event.created,
      ...extraMetadata,
    }),
    stripe_event_id: event.id,
  });

  if (error) {
    console.error("Stripe webhook: Error logging to subscription_history", error);
  }
}
