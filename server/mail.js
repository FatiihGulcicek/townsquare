"use strict";
const fs = require("fs");
const nodemailer = require("nodemailer");

const from = (process.env.MAIL_FROM || "").trim();
const smtp = !!(from && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const sendmail = !!(from && process.env.MAIL_SENDMAIL === "1" && fs.existsSync(process.env.SENDMAIL_PATH || "/usr/sbin/sendmail"));
const transport = smtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      requireTLS: Number(process.env.SMTP_PORT || 587) !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  : sendmail
    ? nodemailer.createTransport({ sendmail: true, path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail" })
    : null;

module.exports = {
  enabled: () => !!transport,
  async sendCode(email, code) {
    if (!transport) throw new Error("mail not configured");
    await transport.sendMail({
      from,
      to: email,
      subject: "Darkspire giriş kodun",
      text: `Darkspire giriş kodun: ${code}\n\nBu kod 10 dakika geçerlidir. İsteği sen yapmadıysan bu mesajı yok say.`,
    });
  },
};
