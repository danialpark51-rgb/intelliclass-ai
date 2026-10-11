import nodemailer from "nodemailer";
import type { SmtpConfig } from "../../config/env";

export type PasswordResetEmailSender = (recipient: string, resetUrl: string) => Promise<void>;

export function createPasswordResetEmailSender(config: SmtpConfig): PasswordResetEmailSender {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return async (recipient, resetUrl) => {
    const escapedUrl = resetUrl
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    await transporter.sendMail({
      from: config.from,
      to: recipient,
      subject: "Reset your IntelliClass password",
      text: [
        "We received a request to reset your IntelliClass password.",
        "",
        `Use this link within 30 minutes: ${resetUrl}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: [
        "<p>We received a request to reset your IntelliClass password.</p>",
        `<p><a href="${escapedUrl}">Reset your password</a></p>`,
        "<p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>",
      ].join(""),
    });
  };
}
