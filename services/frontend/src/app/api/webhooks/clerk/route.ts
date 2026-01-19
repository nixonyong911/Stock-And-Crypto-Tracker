import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { createStripeCustomer, stripe } from "@/lib/stripe/stripe";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
  }

  // Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Handle the webhook event
  const eventType = evt.type;
  const supabase = getSupabaseAdmin();

  try {
    switch (eventType) {
      case "user.created": {
        const { id, email_addresses, first_name, last_name, image_url } =
          evt.data;

        const email = email_addresses?.[0]?.email_address;
        const displayName =
          [first_name, last_name].filter(Boolean).join(" ") ||
          email?.split("@")[0] ||
          "User";

        // Create Stripe customer first
        let stripeCustomerId: string | null = null;
        if (email) {
          try {
            const stripeCustomer = await createStripeCustomer(email, displayName, {
              clerk_user_id: id,
            });
            stripeCustomerId = stripeCustomer.id;
            console.log(`Stripe customer created: ${stripeCustomerId} for Clerk user ${id}`);
          } catch (stripeError) {
            console.error("Error creating Stripe customer:", stripeError);
            // Continue without Stripe customer - can be created later
          }
        }

        // Create user in database with stripe_customer_id
        const { error } = await supabase.from("users").insert({
          clerk_user_id: id,
          email: email,
          display_name: displayName,
          avatar_url: image_url,
          tier: "free",
          stripe_customer_id: stripeCustomerId,
        });

        if (error) {
          console.error("Error creating user:", error);
          return new Response("Database error", { status: 500 });
        }

        console.log(`User created: ${id}`);
        break;
      }

      case "user.updated": {
        const { id, email_addresses, first_name, last_name, image_url } =
          evt.data;

        const email = email_addresses?.[0]?.email_address;
        const displayName =
          [first_name, last_name].filter(Boolean).join(" ") ||
          email?.split("@")[0] ||
          "User";

        // Get current user to check if they have a Stripe customer
        const { data: existingUser } = await supabase
          .from("users")
          .select("stripe_customer_id")
          .eq("clerk_user_id", id)
          .single();

        // Update Stripe customer email if it changed
        if (existingUser?.stripe_customer_id && email) {
          try {
            await stripe.customers.update(existingUser.stripe_customer_id, {
              email: email,
              name: displayName,
            });
          } catch (stripeError) {
            console.error("Error updating Stripe customer:", stripeError);
          }
        }

        const { error } = await supabase
          .from("users")
          .update({
            email: email,
            display_name: displayName,
            avatar_url: image_url,
            updated_at: new Date().toISOString(),
          })
          .eq("clerk_user_id", id);

        if (error) {
          console.error("Error updating user:", error);
          return new Response("Database error", { status: 500 });
        }

        console.log(`User updated: ${id}`);
        break;
      }

      case "user.deleted": {
        const { id } = evt.data;

        if (id) {
          // Get user to find Stripe customer ID and active subscription
          const { data: user } = await supabase
            .from("users")
            .select("id, stripe_customer_id")
            .eq("clerk_user_id", id)
            .single();

          if (user?.stripe_customer_id) {
            // Cancel any active subscriptions at period end
            try {
              const subscriptions = await stripe.subscriptions.list({
                customer: user.stripe_customer_id,
                status: "active",
              });

              for (const sub of subscriptions.data) {
                await stripe.subscriptions.update(sub.id, {
                  cancel_at_period_end: true,
                });
                console.log(`Canceled subscription ${sub.id} at period end for deleted user ${id}`);
              }

              // Also check for trialing subscriptions
              const trialingSubscriptions = await stripe.subscriptions.list({
                customer: user.stripe_customer_id,
                status: "trialing",
              });

              for (const sub of trialingSubscriptions.data) {
                await stripe.subscriptions.update(sub.id, {
                  cancel_at_period_end: true,
                });
                console.log(`Canceled trialing subscription ${sub.id} for deleted user ${id}`);
              }
            } catch (stripeError) {
              console.error("Error canceling subscriptions:", stripeError);
              // Continue with user deletion
            }
          }

          // Delete user from database (subscriptions will cascade delete)
          const { error } = await supabase
            .from("users")
            .delete()
            .eq("clerk_user_id", id);

          if (error) {
            console.error("Error deleting user:", error);
            return new Response("Database error", { status: 500 });
          }

          console.log(`User deleted: ${id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
