import Stripe from "stripe";

// Lazy-initialized Stripe instance to avoid build-time errors
// STRIPE_SECRET_KEY is only available at runtime, not during Next.js build
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(key, {
      apiVersion: "2025-12-15.clover",
      typescript: true,
    });
  }
  return _stripe;
}

// For backward compatibility - get stripe instance
// Only expose the resources that are actually used in the codebase
export const stripe = {
  get customers() { return getStripe().customers; },
  get prices() { return getStripe().prices; },
  get subscriptions() { return getStripe().subscriptions; },
  get billingPortal() { return getStripe().billingPortal; },
  get webhooks() { return getStripe().webhooks; },
  get checkout() { return getStripe().checkout; },
};

// Helper to convert Unix timestamp to Date
export function unixToDate(timestamp: number | null | undefined): Date | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000);
}

// Helper to get subscription status for tier determination
export function isActiveSubscription(status: string): boolean {
  return ["active", "trialing"].includes(status);
}

// Get price details from Stripe
export async function getPriceDetails(priceId: string) {
  const price = await stripe.prices.retrieve(priceId, {
    expand: ["product"],
  });
  return price;
}

// Create Stripe customer for a user
export async function createStripeCustomer(email: string, name: string, metadata?: Record<string, string>) {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      source: "stockandcryptotracker",
      ...metadata,
    },
  });
  return customer;
}

// Get or create Stripe customer
export async function getOrCreateStripeCustomer(
  email: string,
  name: string,
  existingCustomerId?: string | null
): Promise<Stripe.Customer> {
  if (existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(existingCustomerId);
      if (!existing.deleted) {
        return existing as Stripe.Customer;
      }
    } catch {
      // Customer doesn't exist, create new one
    }
  }

  // Search for existing customer by email
  const existingCustomers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  return createStripeCustomer(email, name);
}

// Create billing portal session
export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session;
}

// Cancel subscription at period end
export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
  return subscription;
}

// Reactivate canceled subscription
export async function reactivateSubscription(subscriptionId: string) {
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
  return subscription;
}

// Update subscription to different price (with proration)
export async function updateSubscriptionPrice(subscriptionId: string, newPriceId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    proration_behavior: "create_prorations",
  });
  
  return updatedSubscription;
}

// Check if email has used a trial before (for trial-once-per-email enforcement)
export async function hasUsedTrial(email: string): Promise<boolean> {
  try {
    // Search for existing customers by email
    const customers = await stripe.customers.list({
      email,
      limit: 10,
    });

    if (customers.data.length === 0) {
      return false;
    }

    // Check if any customer has had a subscription with a trial
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 100,
        status: "all", // Include canceled, active, trialing, etc.
      });

      for (const sub of subscriptions.data) {
        // If trial_start exists, user has used a trial
        if (sub.trial_start !== null) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking trial history:", error);
    // Default to allowing trial if check fails (better UX)
    return false;
  }
}

// Create checkout session with conditional trial
export async function createCheckoutSession(options: {
  priceId: string;
  customerId?: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId?: string;
  includeTrial: boolean;
}) {
  const sessionConfig: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "subscription",
    line_items: [{ price: options.priceId, quantity: 1 }],
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    customer_email: options.customerId ? undefined : options.customerEmail,
    customer: options.customerId || undefined,
    client_reference_id: options.clientReferenceId,
    billing_address_collection: "auto",
    payment_method_collection: "always",
  };

  // Only add trial if user hasn't used one before
  if (options.includeTrial) {
    sessionConfig.subscription_data = {
      trial_period_days: 7,
      trial_settings: {
        end_behavior: {
          missing_payment_method: "pause",
        },
      },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return session;
}