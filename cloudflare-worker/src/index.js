import PostalMime from "postal-mime";

const MAX_PREVIEW_LENGTH = 280;
const MAX_BODY_LENGTH = 12000;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeFilter(value) {
  return encodeURIComponent(value);
}

function buildPreview(parsedMail) {
  const source = [parsedMail.text, parsedMail.html]
    .filter(Boolean)
    .map((value) => stripHtml(value))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  return source.slice(0, MAX_PREVIEW_LENGTH) || "";
}

function buildBodyText(parsedMail) {
  const source = parsedMail.text || stripHtml(parsedMail.html || "");
  return source.replace(/\u0000/g, "").trim().slice(0, MAX_BODY_LENGTH);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function parseIncomingEmail(message) {
  const parser = new PostalMime();
  return parser.parse(message.raw);
}

async function getMailboxByAddress(env, inboxEmail) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_mailboxes?select=id,display_name,inbox_email,route_token,is_active&inbox_email=eq.${escapeFilter(inboxEmail)}&is_active=is.true&limit=1`,
    {
      headers: buildSupabaseHeaders(env)
    }
  );

  if (!response.ok) {
    throw new Error(`Mailbox lookup failed with ${response.status}`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

async function insertIncomingEmail(env, payload) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/incoming_emails`, {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(env),
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Insert incoming_emails failed with ${response.status}: ${errorText}`);
  }
}

async function insertProcessingLog(env, payload) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/mail_processing_logs`, {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(env),
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Insert mail_processing_logs failed", errorText);
  }
}

function buildSupabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };
}

function assertEnv(env) {
  if (!env.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL");
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
}

function assertRecipientDomain(recipient, env) {
  const mailDomain = normalizeEmail(env.MAIL_DOMAIN || "lkom.cloud");
  if (!recipient.endsWith(`@${mailDomain}`)) {
    throw new Error(`Recipient domain not allowed: ${recipient}`);
  }
}

function resolveReceivedAt(dateHeader) {
  if (!dateHeader) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(dateHeader);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  return parsedDate.toISOString();
}

export default {
  async email(message, env, ctx) {
    const recipient = normalizeEmail(message.to);
    const sender = normalizeEmail(message.from);

    try {
      assertEnv(env);

      assertRecipientDomain(recipient, env);

      const mailbox = await getMailboxByAddress(env, recipient);
      if (!mailbox) {
        await insertProcessingLog(env, {
          inbox_email: recipient,
          sender_email: sender || null,
          status: "rejected",
          error_message: "Mailbox not registered"
        });
        message.setReject("Mailbox not registered");
        return;
      }

      const parsedMail = await parseIncomingEmail(message);
      const subject = String(parsedMail.subject || message.headers.get("subject") || "").trim();
      const senderName = parsedMail.from?.name || "";
      const senderEmail = normalizeEmail(parsedMail.from?.address || sender);
      const previewText = buildPreview(parsedMail);
      const bodyText = buildBodyText(parsedMail);
      const receivedAt = resolveReceivedAt(message.headers.get("date"));

      await insertIncomingEmail(env, {
        mailbox_id: mailbox.id,
        sender_name: senderName || null,
        sender_email: senderEmail || "unknown@unknown.local",
        subject: subject || "(No subject)",
        preview_text: previewText || null,
        body_text: bodyText || null,
        received_at: receivedAt
      });

      await insertProcessingLog(env, {
        mailbox_id: mailbox.id,
        inbox_email: recipient,
        sender_email: senderEmail || null,
        subject: subject || "(No subject)",
        status: "stored",
        error_message: null
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      try {
        await insertProcessingLog(env, {
          inbox_email: recipient || null,
          sender_email: sender || null,
          status: "error",
          error_message: reason
        });
      } catch (logError) {
        console.error("Failed to write processing log", logError);
      }

      console.error("Email processing failed", {
        error: reason,
        to: message.to,
        from: message.from
      });

      if (reason.includes("Missing SUPABASE_URL")) {
        message.setReject("Worker missing SUPABASE_URL");
        return;
      }

      if (reason.includes("Missing SUPABASE_SERVICE_ROLE_KEY")) {
        message.setReject("Worker missing service role key");
        return;
      }

      if (reason.includes("Recipient domain not allowed")) {
        message.setReject("Recipient domain not allowed");
        return;
      }

      if (reason.includes("Mailbox lookup failed")) {
        message.setReject("Mailbox lookup failed");
        return;
      }

      if (reason.includes("Insert incoming_emails failed")) {
        message.setReject("Mailbox storage failed");
        return;
      }

      message.setReject("MailDesk processing failed");
    }
  },

  async fetch() {
    return new Response("MailDesk email worker is running.", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
};
