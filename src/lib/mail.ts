import { Resend } from "resend";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

async function getResendClient() {
  const apiKeyRow = await db.query.settings.findFirst({ where: eq(settings.key, "resend_api_key") });
  const fromEmailRow = await db.query.settings.findFirst({ where: eq(settings.key, "resend_from_email") });
  const fromNameRow = await db.query.settings.findFirst({ where: eq(settings.key, "resend_from_name") });

  const apiKey = apiKeyRow?.value;
  const fromEmail = fromEmailRow?.value || "onboarding@resend.dev";
  const fromName = fromNameRow?.value || "Jotify Moment";

  if (!apiKey) {
    return null;
  }

  const resend = new Resend(apiKey);
  const formattedFrom = `${fromName} <${fromEmail}>`;

  return { resend, fromEmail: formattedFrom };
}

export async function sendVerificationCode(email: string, code: string): Promise<{ sent: boolean; emailConfigured: boolean }> {
  const subject = `[Jotify Moment] 注册验证码: ${code}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 24px; text-align: center;">Jotify Moment 验证码</h2>
      <p style="font-size: 15px; color: #3f3f46; line-height: 24px; text-align: center;">你正在注册 Jotify Moment，验证码如下：</p>
      <div style="background-color: #f4f4f5; padding: 16px; text-align: center; border-radius: 8px; margin: 24px 0; border: 1px dashed #e4e4e7;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #09090b;">${code}</span>
      </div>
      <p style="font-size: 13px; color: #71717a; text-align: center; line-height: 20px;">此验证码在 10 分钟内有效。如非本人操作，请忽略此邮件。</p>
    </div>
  `;

  const client = await getResendClient();
  if (!client) {
    console.log("\n==================================================");
    console.log(`[DEV/TEST ONLY] Verification code for ${email}: ${code}`);
    console.log("==================================================\n");
    return { sent: true, emailConfigured: false };
  }

  try {
    const data = await client.resend.emails.send({
      from: client.fromEmail,
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
  const client = await getResendClient();
  if (!client) {
    console.log(`[DEV/TEST ONLY] Welcome email for ${email} (${name})`);
    return;
  }

  try {
    await client.resend.emails.send({
      from: client.fromEmail,
      to: email,
      subject: `欢迎加入 Jotify Moment，${name}！`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 24px; text-align: center;">欢迎加入 Jotify Moment 🎉</h2>
          <p style="font-size: 15px; color: #3f3f46; line-height: 24px;">你好，<strong>${name}</strong>！</p>
          <p style="font-size: 15px; color: #3f3f46; line-height: 24px; margin-top: 12px;">你的 Moment 账号已成功创建。现在你可以记录生活，珍藏瞬间，感受温暖。</p>
          <div style="text-align: center; margin-top: 28px;">
            <a href="${process.env.BETTER_AUTH_URL}" style="background-color: #18181b; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; display: inline-block;">进入主页</a>
          </div>
          <p style="font-size: 12px; color: #a1a1aa; margin-top: 28px; text-align: center;">如果你未曾注册过此账户，请忽略这封邮件。</p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Failed to send welcome email:", error);
  }
}

export async function sendResetPasswordLink(email: string, token: string, origin: string): Promise<{ sent: boolean; emailConfigured: boolean }> {
  const resetLink = `${origin}/reset-password?token=${token}`;
  const subject = `[Jotify Moment] 重置您的账户密码`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #09090b; font-size: 20px; font-weight: 600; margin-bottom: 24px; text-align: center;">重置您的密码</h2>
      <p style="font-size: 15px; color: #3f3f46; line-height: 24px;">您好，</p>
      <p style="font-size: 15px; color: #3f3f46; line-height: 24px; margin-top: 12px;">我们收到了重置您 Jotify Moment 账户密码的请求。请点击下方按钮重置您的密码：</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetLink}" style="background-color: #dc2626; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; display: inline-block;">重置密码</a>
      </div>
      <p style="font-size: 13px; color: #71717a; line-height: 20px; margin-top: 20px;">此链接在 2 小时内有效。如非本人操作，请忽略此邮件，您的账户依然是安全的。</p>
      <div style="border-top: 1px solid #e4e4e7; margin-top: 28px; padding-top: 16px;">
        <p style="font-size: 11px; color: #a1a1aa; word-break: break-all;">若上方按钮无法点击，请复制并访问以下链接：<br />${resetLink}</p>
      </div>
    </div>
  `;

  const client = await getResendClient();
  if (!client) {
    console.log("\n==================================================");
    console.log(`[DEV/TEST ONLY] Reset password link for ${email}: ${resetLink}`);
    console.log("==================================================\n");
    return { sent: true, emailConfigured: false };
  }

  try {
    const data = await client.resend.emails.send({
      from: client.fromEmail,
      to: email,
      subject,
      html,
    });
    return { sent: !!data.data?.id, emailConfigured: true };
  } catch (error) {
    console.error("Failed to send reset password email via Resend:", error);
    return { sent: false, emailConfigured: true };
  }
}
