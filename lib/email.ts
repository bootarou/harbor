import "server-only";
import nodemailer from "nodemailer";

// メール送信。SMTP 環境変数が揃っていれば送信、無ければログ出力にフォールバック（開発用）。
// 必要env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ delivered: boolean }> {
  if (!smtpConfigured()) {
    console.log(
      `[email:fallback] SMTP未設定のため送信せずログ出力\n--- TO: ${args.to}\n--- SUBJECT: ${args.subject}\n${args.text}`
    );
    return { delivered: false };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: args.to,
    subject: args.subject,
    text: args.text,
  });
  return { delivered: true };
}
