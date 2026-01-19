import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/stripe";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
  }

  try {
    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    // For trials: payment_status is "no_payment_required", status is "complete"
    // For regular payments: payment_status is "paid", status is "complete"
    const isValid = session.status === "complete" || 
                    session.payment_status === "paid" || 
                    session.payment_status === "no_payment_required";
    
    if (!isValid) {
      return NextResponse.json(
        { error: "Payment not completed", status: session.status, payment_status: session.payment_status },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      customer_email: session.customer_details?.email,
      subscription_id: session.subscription,
      client_reference_id: session.client_reference_id,
    });
  } catch (error) {
    console.error("Error verifying checkout session:", error);
    return NextResponse.json(
      { error: "Failed to verify session" },
      { status: 500 }
    );
  }
}
