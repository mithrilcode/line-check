"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Sends plain-text email.
 *
 * With SMTP_URL set (e.g. "smtps://user:pass@smtp.example.com:465") mail goes
 * out through that server. Without it, each message is written to
 * DATA_DIR/outbox/ and logged, so invites and password resets still work in
 * local development.
 *
 * @returns {{ send(message: { to: string, subject: string, text: string }): Promise<{ delivered: boolean }>, configured: boolean }}
 */
function createMailer({ smtpUrl, from, outboxDir, log = console.log }) {
  if (smtpUrl) {
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport(smtpUrl);
    return {
      configured: true,
      async send({ to, subject, text }) {
        await transport.sendMail({ from, to, subject, text });
        return { delivered: true };
      },
    };
  }

  return {
    configured: false,
    async send({ to, subject, text }) {
      fs.mkdirSync(outboxDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = path.join(outboxDir, `${stamp}-${to.replace(/[^a-z0-9@.]/gi, "_")}.txt`);
      fs.writeFileSync(file, `From: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
      log(`Email to ${to}: "${subject}" (SMTP not configured; saved to ${file})`);
      return { delivered: false };
    },
  };
}

module.exports = { createMailer };
