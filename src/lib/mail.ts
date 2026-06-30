import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";

export async function sendVerificationCode(email: string, code: string): Promise<{ sent: boolean; emailConfigured: boolean }> {
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
    return { sent: true, emailConfigured: false };
  }

  try {
    const data = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject,
      html,
    });
    return { sent: !!data.data?.id, emailConfigured: true };
  } catch (error) {
    console.error("Failed to send verification email via Resend:", error);
    return { sent: false, emailConfigured: true };
  }
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  if (!resend) {
    console.log(`[DEV/TEST ONLY] Welcome email for ${email} (${name})`);
    return;
  }

  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `欢迎加入 Jotify Moment，${name}！`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 5px;">
          <h2 style="color: #111; margin-bottom: 20px;">欢迎加入 Jotify Moment 🎉</h2>
          <p style="font-size: 16px; color: #555;">你好，<strong>${name}</strong>！</p>
          <p style="font-size: 14px; color: #555; margin-top: 10px;">你的账号已创建成功。现在可以登录并开始记录生活、分享此刻。</p>
          <p style="font-size: 12px; color: #999; margin-top: 20px;">如果你没有注册此账号，请忽略此邮件。</p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send welcome email:", error);
  }
}
