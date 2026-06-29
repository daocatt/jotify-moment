import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";

export async function sendVerificationCode(email: string, code: string): Promise<boolean> {
  const subject = `[Jotify Moment] Verification Code: ${code}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 5px;">
      <h2 style="color: #111; margin-bottom: 20px;">Jotify Moment Verification</h2>
      <p style="font-size: 16px; color: #555;">Your verification code is:</p>
      <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000;">${code}</span>
      </div>
      <p style="font-size: 14px; color: #999;">This code will expire in 10 minutes. If you did not request this email, you can safely ignore it.</p>
    </div>
  `;

  if (!resend) {
    console.log("\n==================================================");
    console.log(`[DEV/TEST ONLY] Verification code for ${email}: ${code}`);
    console.log("==================================================\n");
    return true;
  }

  try {
    const data = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject,
      html,
    });
    return !!data.data?.id;
  } catch (error) {
    console.error("Failed to send verification email via Resend:", error);
    return false;
  }
}
