import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";

const ADMIN_PASSWORD = "IkiJeporo1954";
const ADMIN_SESSION_KEY = "maildesk-admin-unlocked";

const sampleMailbox = {
  mailbox_id: "sample-mailbox",
  slug: "demo-user",
  display_name: "Demo User",
  inbox_email: "demo-otp@maildesk.local"
};

const sampleInbox = [
  {
    id: "sample-1",
    sender_name: "Telegram",
    sender_email: "login@telegram.org",
    subject: "Kode login Anda 384921",
    preview_text: "Gunakan kode 384921 untuk masuk. Jangan berikan kode ini ke siapa pun.",
    body_text: "Gunakan kode 384921 untuk masuk ke akun Anda.",
    received_at: new Date().toISOString()
  },
  {
    id: "sample-2",
    sender_name: "Google",
    sender_email: "no-reply@accounts.google.com",
    subject: "Kode verifikasi Google",
    preview_text: "Masukkan kode 771204 untuk menyelesaikan login.",
    body_text: "Kode verifikasi Anda adalah 771204.",
    received_at: new Date(Date.now() - 3600 * 1000).toISOString()
  }
];

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function extractOtp(message) {
  const source = [message.subject, message.preview_text, message.body_text]
    .filter(Boolean)
    .join(" ");
  const match = source.match(/\b\d{4,8}\b/);
  return match ? match[0] : null;
}

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(helper);
  return copied;
}

function buildCurrentLink() {
  return window.location.href;
}

function isMailboxView() {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("mailbox") && params.get("token"));
}

function App() {
  const [mailbox, setMailbox] = useState(null);
  const [inbox, setInbox] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [toast, setToast] = useState("");
  const [inboxStatus, setInboxStatus] = useState("Membaca link mailbox");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(() => {
    if (isMailboxView()) {
      return true;
    }

    return window.localStorage.getItem(ADMIN_SESSION_KEY) === "1";
  });

  const latestOtp = useMemo(() => {
    for (const message of inbox) {
      const otp = extractOtp(message);
      if (otp) {
        return {
          code: otp,
          sender: message.sender_name || message.sender_email,
          receivedAt: message.received_at
        };
      }
    }

    return null;
  }, [inbox]);

  useEffect(() => {
    refreshInbox();
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refreshInbox() {
    setLoadingInbox(true);

    const params = new URLSearchParams(window.location.search);
    const mailboxSlug = params.get("mailbox");
    const accessToken = params.get("token");
    const supabase = getSupabaseClient();

    if (!mailboxSlug || !accessToken || !supabase) {
      setMailbox(sampleMailbox);
      setInbox(sampleInbox);
      setInboxStatus(!supabase ? "Mode contoh" : "Link mailbox belum lengkap");
      setLoadingInbox(false);
      return;
    }

    const [{ data: mailboxData, error: mailboxError }, { data: inboxData, error: inboxError }] = await Promise.all([
      supabase.rpc("get_mailbox_context", {
        p_slug: mailboxSlug,
        p_access_token: accessToken
      }),
      supabase.rpc("get_mailbox_inbox", {
        p_slug: mailboxSlug,
        p_access_token: accessToken,
        p_limit: 12
      })
    ]);

    if (mailboxError || inboxError) {
      setMailbox(sampleMailbox);
      setInbox(sampleInbox);
      setInboxStatus("RPC gagal");
      setToast(mailboxError?.message || inboxError?.message || "Mailbox gagal dimuat.");
      setLoadingInbox(false);
      return;
    }

    const currentMailbox = Array.isArray(mailboxData) ? mailboxData[0] : mailboxData;
    if (!currentMailbox) {
      setMailbox(sampleMailbox);
      setInbox(sampleInbox);
      setInboxStatus("Mailbox tidak ditemukan");
      setLoadingInbox(false);
      return;
    }

    setMailbox(currentMailbox);
    setInbox(Array.isArray(inboxData) ? inboxData : []);
    setInboxStatus("Mailbox aktif");
    setLoadingInbox(false);
  }

  async function handleCopyLatestOtp() {
    if (!latestOtp) {
      setToast("Belum ada OTP yang terdeteksi.");
      return;
    }

    await copyText(latestOtp.code);
    setToast("OTP disalin.");
  }

  async function handleCopyLink() {
    await copyText(buildCurrentLink());
    setToast("Link mailbox disalin.");
  }

  function handleAdminUnlock(event) {
    event.preventDefault();

    if (adminPassword !== ADMIN_PASSWORD) {
      setToast("Password admin salah.");
      return;
    }

    window.localStorage.setItem(ADMIN_SESSION_KEY, "1");
    setAdminUnlocked(true);
    setAdminPassword("");
  }

  if (!adminUnlocked) {
    return (
      <div className="admin-shell">
        <section className="admin-card">
          <div className="brand-block">
            <div className="brand-mark">M</div>
            <div>
              <p className="brand-title">MailDesk OTP</p>
              <span className="brand-subtitle">Admin Access</span>
            </div>
          </div>

          <div className="admin-copy">
            <p className="hero-kicker">Area Admin</p>
            <h1>Halaman depan dikunci</h1>
            <p className="hero-copy">
              Root dashboard hanya bisa dibuka admin. Link mailbox user tetap bisa diakses langsung dengan token masing-masing.
            </p>
          </div>

          <form className="admin-form" onSubmit={handleAdminUnlock}>
            <label className="field">
              <span>Password admin</span>
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Masukkan password"
              />
            </label>
            <button className="button" type="submit">
              Masuk admin
            </button>
          </form>
        </section>

        <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">M</div>
          <div>
            <p className="brand-title">MailDesk OTP</p>
            <span className="brand-subtitle">React + Supabase RPC</span>
          </div>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Status</span>
          <strong>{inboxStatus}</strong>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Mailbox</span>
          <strong>{mailbox?.display_name || "-"}</strong>
          <span>{mailbox?.inbox_email || "-"}</span>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Ringkas</span>
          <strong>{inbox.length} email</strong>
          <strong>{latestOtp ? `OTP ${latestOtp.code}` : "OTP belum ada"}</strong>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <p className="hero-kicker">Dashboard OTP</p>
            <h1>Satu link untuk satu inbox OTP user</h1>
            <p className="hero-copy">
              Buka dashboard dengan format link `?mailbox=slug-user&token=secret-token` lalu panel ini hanya menampilkan email milik user tersebut.
            </p>
          </div>
          <div className="hero-actions">
            <button className="button button-secondary" type="button" onClick={handleCopyLink}>
              Copy link
            </button>
            <button className="button button-secondary" type="button" onClick={refreshInbox} disabled={loadingInbox}>
              {loadingInbox ? "Memuat..." : "Refresh inbox"}
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card accent-card">
            <span>OTP terbaru</span>
            <strong>{latestOtp?.code || "Belum ada"}</strong>
            <p>{latestOtp ? `${latestOtp.sender} - ${formatTime(latestOtp.receivedAt)}` : "Belum ada email OTP yang cocok."}</p>
            <button className="button" type="button" onClick={handleCopyLatestOtp}>
              Copy OTP
            </button>
          </article>

          <article className="stat-card">
            <span>Mailbox user</span>
            <strong>{mailbox?.slug || "-"}</strong>
            <p>{mailbox?.inbox_email || "Tambahkan mailbox dan token di URL."}</p>
          </article>

          <article className="stat-card">
            <span>Email terbaru</span>
            <strong>{inbox.length}</strong>
            <p>{inbox[0] ? formatTime(inbox[0].received_at) : "Belum ada email masuk."}</p>
          </article>
        </section>

        <section className="content-grid single-column">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Inbox user</h2>
                <p>Data diambil lewat fungsi `get_mailbox_inbox` di Supabase.</p>
              </div>
            </div>

            <div className="inbox-list">
              {inbox.length ? (
                inbox.map((message) => {
                  const otp = extractOtp(message);

                  return (
                    <article className="email-card" key={message.id}>
                      <div className="email-card-top">
                        <strong>{message.sender_name || message.sender_email}</strong>
                        <span>{formatTime(message.received_at)}</span>
                      </div>
                      <p className="email-address">{message.sender_email}</p>
                      <p className="email-subject">{message.subject}</p>
                      <p className="email-preview">{message.preview_text || message.body_text || "-"}</p>
                      <div className="email-meta">
                        <span className={`status-pill ${otp ? "valid" : "invalid"}`}>
                          {otp ? `OTP ${otp}` : "Tanpa OTP"}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-box">Belum ada email untuk mailbox ini.</div>
              )}
            </div>
          </div>
        </section>
      </main>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

export default App;
