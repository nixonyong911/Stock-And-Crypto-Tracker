import { NextRequest, NextResponse } from "next/server";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// Auto-reply email template
function createAutoReplyHtml(name: string, subject: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 2px solid #0066cc; padding-bottom: 20px; margin-bottom: 20px;">
    <h1 style="margin: 0; font-size: 24px; color: #0066cc;">Stock And Crypto Tracker</h1>
  </div>
  
  <p>Hi ${name},</p>
  
  <p>Thank you for contacting us. We have received your message regarding "<strong>${subject}</strong>" and will respond within <strong>24 hours</strong>.</p>
  
  <p>In the meantime, you can:</p>
  <ul>
    <li>Check our <a href="https://stockandcryptotracker.com/en/faq" style="color: #0066cc;">FAQ page</a> for common questions</li>
    <li>Start using our bot on <a href="https://t.me/StockAndCryptoAdvisorBot" style="color: #0066cc;">Telegram</a></li>
  </ul>
  
  <p>Best regards,<br>
  <strong>Stock And Crypto Tracker Team</strong></p>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
    <p>This is an automated response. Please do not reply directly to this email.</p>
    <p>© ${new Date().getFullYear()} Stock And Crypto Tracker. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();
}

// Notification email to admin
function createNotificationHtml(data: ContactFormData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0066cc;">New Contact Form Submission</h2>
  
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Name:</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${data.name}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;"><a href="mailto:${data.email}">${data.email}</a></td>
    </tr>
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Subject:</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${data.subject}</td>
    </tr>
    <tr>
      <td style="padding: 10px; font-weight: bold; vertical-align: top;">Message:</td>
      <td style="padding: 10px; white-space: pre-wrap;">${data.message}</td>
    </tr>
  </table>
  
  <p style="font-size: 12px; color: #666;">Received at: ${new Date().toISOString()}</p>
</body>
</html>
  `.trim();
}

async function sendEmail(
  to: { email: string; name?: string },
  subject: string,
  htmlContent: string,
  replyTo?: { email: string; name?: string }
): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.error("BREVO_API_KEY is not configured");
    return false;
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Stock And Crypto Tracker",
          email: "no-reply@stockandcryptotracker.com",
        },
        to: [to],
        replyTo: replyTo,
        subject: subject,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Brevo API error:", errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: ContactFormData = await request.json();

    // Validate required fields
    if (!data.name || !data.email || !data.subject || !data.message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Sanitize inputs (basic XSS prevention)
    const sanitizedData: ContactFormData = {
      name: data.name.slice(0, 100).replace(/[<>]/g, ""),
      email: data.email.slice(0, 255),
      subject: data.subject.slice(0, 200).replace(/[<>]/g, ""),
      message: data.message.slice(0, 5000).replace(/[<>]/g, ""),
    };

    // Send auto-reply to user
    const autoReplySuccess = await sendEmail(
      { email: sanitizedData.email, name: sanitizedData.name },
      `We received your message - Stock And Crypto Tracker`,
      createAutoReplyHtml(sanitizedData.name, sanitizedData.subject)
    );

    // Forward to contact email
    const notificationSuccess = await sendEmail(
      { email: "contact@stockandcryptotracker.com" },
      `[Contact Form] ${sanitizedData.subject}`,
      createNotificationHtml(sanitizedData),
      { email: sanitizedData.email, name: sanitizedData.name }
    );

    if (!autoReplySuccess && !notificationSuccess) {
      return NextResponse.json(
        { error: "Failed to send email. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Your message has been sent successfully.",
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
