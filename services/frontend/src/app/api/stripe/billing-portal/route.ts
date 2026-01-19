import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/stripe/stripe";
import { getUserByClerkId } from "@/lib/db/users";

export async function POST(request: NextRequest) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { returnUrl } = await request.json();

        // Get user from database
        const user = await getUserByClerkId(userId);

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.stripe_customer_id) {
            return NextResponse.json(
                { error: "No Stripe customer found. Please subscribe first." },
                { status: 400 }
            );
        }

        // Create billing portal session
        // Note: NEXT_PUBLIC_APP_URL is configured in Infisical for all environments
        const session = await createBillingPortalSession(
            user.stripe_customer_id,
            returnUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
        );

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Error creating billing portal session:", error);
        return NextResponse.json(
            { error: "Failed to create billing portal session" },
            { status: 500 }
        );
    }
}
