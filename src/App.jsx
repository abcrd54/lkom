import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";

const ADMIN_SESSION_KEY = "maildesk-admin-session";
const MAIL_DOMAIN = "lkom.cloud";

const sampleMailboxes = [
  {
    mailbox_id: "sample-mailbox-1",
    display_name: "Demo User",
    inbox_email: `demo-otp@${MAIL_DOMAIN}`,
    route_token: "c7f4124f5287d10d4f0f3934ad727281",
    is_active: true,
    total_emails: 2,
    latest_received_at: new Date().toISOString()
  },
  {
    mailbox_id: "sample-mailbox-2",
    display_name: "Testing QA",
    inbox_email: `qa-otp@${MAIL_DOMAIN}`,
    route_token: "f7cb11ecaf8f495f8c6678db5c3d9faf",
    is_active: true,
    total_emails: 1,
    latest_received_at: new Date(Date.now() - 7200 * 1000).toISOString()
  }
];

const sampleInbox = [
  {
    id: "sample-1",
    mailbox_id: "sample-mailbox-1",
    mailbox_name: "Demo User",
    inbox_email: `demo-otp@${MAIL_DOMAIN}`,
    sender_name: "Telegram",
    sender_email: "login@telegram.org",
    subject: "Kode login Anda 384921",
    preview_text: "Gunakan kode 384921 untuk masuk. Jangan berikan kode ini ke siapa pun.",
    body_text: "Gunakan kode 384921 untuk masuk ke akun Anda.",
    received_at: new Date().toISOString()
  },
  {
    id: "sample-2",
    mailbox_id: "sample-mailbox-1",
    mailbox_name: "Demo User",
    inbox_email: `demo-otp@${MAIL_DOMAIN}`,
    sender_name: "Google",
    sender_email: "no-reply@accounts.google.com",
    subject: "Kode verifikasi Google",
    preview_text: "Masukkan kode 771204 untuk menyelesaikan login.",
    body_text: "Kode verifikasi Anda adalah 771204.",
    received_at: new Date(Date.now() - 3600 * 1000).toISOString()
  },
  {
    id: "sample-3",
    mailbox_id: "sample-mailbox-2",
    mailbox_name: "Testing QA",
    inbox_email: `qa-otp@${MAIL_DOMAIN}`,
    sender_name: "Discord",
    sender_email: "noreply@discord.com",
    subject: "Your verification code is 556812",
    preview_text: "Use code 556812 to continue login.",
    body_text: "Use code 556812 to continue login.",
    received_at: new Date(Date.now() - 7200 * 1000).toISOString()
  }
];

function formatTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
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

function getPathMode() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments[0] === "mail" && segments[1]) {
    return { mode: "mailbox", routeToken: segments[1] };
  }

  return { mode: "admin", routeToken: null };
}

function buildMailboxLink(routeToken) {
  return `${window.location.origin}/mail/${routeToken}`;
}

function formatDisplayName(localPart) {
  return localPart
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLocalPart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

function AdminLogin({ adminPassword, setAdminPassword, onSubmit, toast }) {
  return (
    <div className="admin-shell">
      <section className="admin-card">
        <div className="brand-block">
          <div className="brand-mark">M</div>
          <div>
            <p className="brand-title">MailDesk</p>
            <span className="brand-subtitle">Panel Admin</span>
          </div>
        </div>

        <div className="admin-copy">
          <p className="hero-kicker">Administrator</p>
          <h1>Akses email terpusat</h1>
          <p className="hero-copy">
            Masuk untuk mengelola alamat email, melihat pesan terbaru, dan membuka link mailbox yang aman.
          </p>
        </div>

        <form className="admin-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Password admin</span>
            <input
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="Masukkan password admin"
            />
          </label>
          <button className="button" type="submit">
            Lanjut
          </button>
        </form>
      </section>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

function MailboxView({ mailbox, inbox, loading, status, toast, onRefresh, onCopyLink, onCopyOtp }) {
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">M</div>
          <div>
            <p className="brand-title">MailDesk</p>
            <span className="brand-subtitle">Inbox Aman</span>
          </div>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Status</span>
          <strong>{status}</strong>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Mailbox</span>
          <strong>{mailbox?.display_name || "-"}</strong>
          <span>{mailbox?.inbox_email || "-"}</span>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Kode terbaru</span>
          <strong>{latestOtp?.code || "Belum ada"}</strong>
          <span>{latestOtp ? formatTime(latestOtp.receivedAt) : "Belum ada kode verifikasi."}</span>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <p className="hero-kicker">Mailbox</p>
            <h1>Akses mailbox pribadi</h1>
            <p className="hero-copy">
              Halaman ini menampilkan email verifikasi terbaru sesuai link aman yang sedang dibuka.
            </p>
          </div>
          <div className="hero-actions">
            <button className="button button-secondary" type="button" onClick={onCopyLink}>
              Salin link
            </button>
            <button className="button button-secondary" type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Memuat..." : "Refresh inbox"}
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card accent-card">
            <span>Kode terbaru</span>
            <strong>{latestOtp?.code || "Belum ada"}</strong>
            <p>{latestOtp ? `${latestOtp.sender} - ${formatTime(latestOtp.receivedAt)}` : "Belum ada email verifikasi yang masuk."}</p>
            <button className="button" type="button" onClick={onCopyOtp}>
              Salin kode
            </button>
          </article>

          <article className="stat-card">
            <span>Alamat email</span>
            <strong>{mailbox?.inbox_email || "-"}</strong>
            <p>{mailbox?.route_token ? "Link akses tersedia" : "Link akses belum tersedia."}</p>
          </article>

          <article className="stat-card">
            <span>Total pesan</span>
            <strong>{inbox.length}</strong>
            <p>{inbox[0] ? formatTime(inbox[0].received_at) : "Belum ada pesan masuk."}</p>
          </article>
        </section>

        <section className="content-grid single-column">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Inbox</h2>
                <p>Pesan terbaru yang masuk ke mailbox ini.</p>
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
                          {otp ? `Kode ${otp}` : "Tanpa kode"}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-box">Belum ada pesan yang masuk ke mailbox ini.</div>
              )}
            </div>
          </div>
        </section>
      </main>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

function AdminView({
  adminPassword,
  mailboxes,
  recentEmails,
  loading,
  bulkLoading,
  status,
  toast,
  onRefresh,
  newMailboxLocalPart,
  onMailboxLocalPartChange,
  onCreateMailbox,
  onCopyMailboxLink,
  onCopyMailboxEmail,
  bulkNames,
  onBulkNamesChange,
  onBulkGenerate,
  onCopyBulkLinks,
  generatedMailboxes
}) {
  const totalActive = mailboxes.filter((mailbox) => mailbox.is_active).length;
  const latestEmail = recentEmails[0];
  const mailboxPreview = newMailboxLocalPart ? `${newMailboxLocalPart}@${MAIL_DOMAIN}` : `nama-user@${MAIL_DOMAIN}`;
  const parsedBulkNames = bulkNames
    .split(/\r?\n/)
    .map((line) => normalizeLocalPart(line.trim()))
    .filter(Boolean);

  return (
    <div className="app-shell admin-layout">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">M</div>
          <div>
            <p className="brand-title">MailDesk</p>
            <span className="brand-subtitle">Operasional</span>
          </div>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Status</span>
          <strong>{status}</strong>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Ringkas</span>
          <strong>{mailboxes.length} mailbox</strong>
          <strong>{totalActive} aktif</strong>
          <strong>{recentEmails.length} terbaru</strong>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Bulk</span>
          <strong>{parsedBulkNames.length} baris siap</strong>
          <span>{generatedMailboxes.length} mailbox baru</span>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Sesi</span>
          <strong>Administrator</strong>
          <span>{adminPassword ? "Sudah masuk di perangkat ini." : "Belum masuk."}</span>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <p className="hero-kicker">Pusat Kontrol</p>
            <h1>Daftar mailbox dan aktivitas terbaru</h1>
            <p className="hero-copy">
              Kelola alamat email, buat link akses aman, dan pantau pesan masuk terbaru dari satu tempat.
            </p>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card accent-card">
            <span>Total mailbox</span>
            <strong>{mailboxes.length}</strong>
            <p>{totalActive} mailbox aktif siap menerima email.</p>
          </article>

          <article className="stat-card">
            <span>Email terbaru</span>
            <strong>{recentEmails.length}</strong>
            <p>{latestEmail ? `${latestEmail.mailbox_name} - ${formatTime(latestEmail.received_at)}` : "Belum ada aktivitas email masuk."}</p>
          </article>

          <article className="stat-card">
            <span>Kode terdeteksi</span>
            <strong>{recentEmails.filter((item) => Boolean(extractOtp(item))).length}</strong>
            <p>Kode verifikasi yang terdeteksi dari email terbaru.</p>
          </article>
        </section>

        <section className="content-grid admin-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Daftar mailbox</h2>
                <p>Alamat email yang aktif beserta link aksesnya.</p>
              </div>
              <button className="button button-secondary" type="button" onClick={onRefresh} disabled={loading || bulkLoading}>
                {loading ? "Memuat..." : "Refresh"}
              </button>
            </div>

            <form className="create-mailbox-form" onSubmit={onCreateMailbox}>
              <label className="field mailbox-field">
                <span>Buat mailbox baru</span>
                <input
                  value={newMailboxLocalPart}
                  onChange={(event) => onMailboxLocalPartChange(event.target.value)}
                  placeholder="contoh: riski-ridho"
                />
              </label>
              <div className="mailbox-preview-row">
                <p className="mailbox-meta">Alamat otomatis: {mailboxPreview}</p>
                <button className="button" type="submit" disabled={loading || bulkLoading}>
                  Buat mailbox
                </button>
              </div>
            </form>

            <div className="mailbox-list">
              {mailboxes.length ? (
                mailboxes.map((mailbox) => (
                  <article className="mailbox-card" key={mailbox.mailbox_id}>
                    <div className="mailbox-header">
                      <div>
                        <strong>{mailbox.display_name}</strong>
                        <p className="email-address">{mailbox.inbox_email}</p>
                      </div>
                      <span className={`status-pill ${mailbox.is_active ? "valid" : "invalid"}`}>
                        {mailbox.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p className="mailbox-meta">Pesan masuk: {mailbox.total_emails || 0}</p>
                    <p className="mailbox-meta">Aktivitas terakhir: {formatTime(mailbox.latest_received_at)}</p>
                    <div className="mailbox-actions">
                      <code className="token-chip">Link akses aman</code>
                      <button className="button button-secondary" type="button" onClick={() => onCopyMailboxEmail(mailbox.inbox_email)}>
                        Salin email
                      </button>
                      <button className="button button-secondary" type="button" onClick={() => onCopyMailboxLink(mailbox.route_token)}>
                        Salin link
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-box">Belum ada mailbox yang tersedia.</div>
              )}
            </div>
          </div>

          <div className="panel panel-large">
            <div className="panel-head">
              <div>
                <h2>Bulk generate mailbox</h2>
                <p>Satu baris akan menjadi satu mailbox baru dengan link akses masing-masing.</p>
              </div>
              <div className="hero-actions">
                <button className="button button-secondary" type="button" onClick={onCopyBulkLinks} disabled={!generatedMailboxes.length}>
                  Salin hasil
                </button>
                <button className="button" type="button" onClick={onBulkGenerate} disabled={loading || bulkLoading}>
                  {bulkLoading ? "Generate..." : "Generate bulk"}
                </button>
              </div>
            </div>

            <label className="field">
              <span>Input local-part per baris</span>
              <textarea
                value={bulkNames}
                onChange={(event) => onBulkNamesChange(event.target.value)}
                placeholder={"budi-santoso\nsiti-aminah\nraka-saputra"}
              />
            </label>

            <div className="inbox-list">
              {generatedMailboxes.length ? (
                generatedMailboxes.map((mailbox) => (
                  <article className="email-card" key={mailbox.mailbox_id}>
                    <div className="email-card-top">
                      <strong>{mailbox.display_name}</strong>
                      <span>{mailbox.inbox_email}</span>
                    </div>
                    <p className="email-preview">{buildMailboxLink(mailbox.route_token)}</p>
                    <div className="email-meta">
                      <button className="button button-secondary" type="button" onClick={() => onCopyMailboxEmail(mailbox.inbox_email)}>
                        Salin email
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-box">Belum ada hasil bulk generate.</div>
              )}
            </div>
          </div>
        </section>

        <section className="content-grid single-column">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Email terbaru</h2>
                <p>Pesan masuk terbaru dari seluruh mailbox.</p>
              </div>
            </div>

            <div className="inbox-list">
              {recentEmails.length ? (
                recentEmails.map((message) => {
                  const otp = extractOtp(message);

                  return (
                    <article className="email-card" key={message.id}>
                      <div className="email-card-top">
                        <strong>{message.mailbox_name || message.inbox_email}</strong>
                        <span>{formatTime(message.received_at)}</span>
                      </div>
                      <p className="email-address">{message.inbox_email}</p>
                      <p className="email-subject">{message.subject}</p>
                      <p className="email-preview">{message.preview_text || message.body_text || "-"}</p>
                      <div className="email-meta">
                        <span className={`status-pill ${otp ? "valid" : "invalid"}`}>
                          {otp ? `Kode ${otp}` : "Tanpa kode"}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-box">Belum ada aktivitas email terbaru.</div>
              )}
            </div>
          </div>
        </section>
      </main>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

function App() {
  const [{ mode, routeToken }] = useState(() => getPathMode());
  const [adminPassword, setAdminPassword] = useState(() => {
    return mode === "admin" ? window.localStorage.getItem(ADMIN_SESSION_KEY) || "" : "";
  });
  const [adminUnlocked, setAdminUnlocked] = useState(() => {
    return mode === "mailbox" ? true : Boolean(window.localStorage.getItem(ADMIN_SESSION_KEY));
  });
  const [mailbox, setMailbox] = useState(null);
  const [mailboxes, setMailboxes] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [recentEmails, setRecentEmails] = useState([]);
  const [generatedMailboxes, setGeneratedMailboxes] = useState([]);
  const [bulkNames, setBulkNames] = useState("");
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [status, setStatus] = useState("Menyiapkan");
  const [toast, setToast] = useState("");
  const [newMailboxLocalPart, setNewMailboxLocalPart] = useState("");

  useEffect(() => {
    if (mode === "mailbox") {
      refreshMailbox();
    }
  }, [mode, routeToken]);

  useEffect(() => {
    if (mode === "admin" && adminUnlocked) {
      refreshAdmin(adminPassword);
    }
  }, [mode, adminUnlocked]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refreshMailbox() {
    setLoading(true);
    const supabase = getSupabaseClient();

    if (!routeToken || !supabase) {
      setMailbox(sampleMailboxes[0]);
      setInbox(sampleInbox.filter((item) => item.mailbox_id === sampleMailboxes[0].mailbox_id));
      setStatus(!supabase ? "Pratinjau offline" : "Mailbox tidak tersedia");
      setLoading(false);
      return;
    }

    const [{ data: mailboxData, error: mailboxError }, { data: inboxData, error: inboxError }] = await Promise.all([
      supabase.rpc("get_mailbox_by_route_token", { p_route_token: routeToken }),
      supabase.rpc("get_mailbox_inbox_by_route_token", { p_route_token: routeToken, p_limit: 12 })
    ]);

    if (mailboxError || inboxError) {
      setMailbox(sampleMailboxes[0]);
      setInbox(sampleInbox.filter((item) => item.mailbox_id === sampleMailboxes[0].mailbox_id));
      setStatus("Sinkronisasi gagal");
      setToast(mailboxError?.message || inboxError?.message || "Mailbox tidak dapat dimuat.");
      setLoading(false);
      return;
    }

    const currentMailbox = Array.isArray(mailboxData) ? mailboxData[0] : mailboxData;
    if (!currentMailbox) {
      setMailbox(null);
      setInbox([]);
      setStatus("Mailbox tidak tersedia");
      setLoading(false);
      return;
    }

    setMailbox(currentMailbox);
    setInbox(Array.isArray(inboxData) ? inboxData : []);
    setStatus("Aktif");
    setLoading(false);
  }

  async function refreshAdmin(password) {
    setLoading(true);
    const supabase = getSupabaseClient();

    if (!password) {
      setStatus("Perlu autentikasi");
      setLoading(false);
      return;
    }

    if (!supabase) {
      setMailboxes(sampleMailboxes);
      setRecentEmails(sampleInbox);
      setStatus("Pratinjau offline");
      setLoading(false);
      return true;
    }

    const { data: isValid, error: passwordError } = await supabase.rpc("is_valid_admin_password", {
      p_admin_password: password
    });

    if (passwordError || !isValid) {
      setMailboxes([]);
      setRecentEmails([]);
      setStatus("Autentikasi gagal");
      setToast(passwordError?.message || "Password tidak valid.");
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      setAdminUnlocked(false);
      setLoading(false);
      return false;
    }

    const [{ data: mailboxData, error: mailboxError }, { data: recentData, error: recentError }] = await Promise.all([
      supabase.rpc("get_admin_mailboxes", { p_admin_password: password }),
      supabase.rpc("get_admin_recent_incoming_emails", { p_admin_password: password, p_limit: 14 })
    ]);

    if (mailboxError || recentError) {
      setMailboxes([]);
      setRecentEmails([]);
      setStatus("Sinkronisasi gagal");
      setToast(mailboxError?.message || recentError?.message || "Dashboard tidak dapat dimuat.");
      setLoading(false);
      return false;
    }

    setMailboxes(Array.isArray(mailboxData) ? mailboxData : []);
    setRecentEmails(Array.isArray(recentData) ? recentData : []);
    setStatus("Aktif");
    setLoading(false);
    return true;
  }

  async function handleAdminUnlock(event) {
    event.preventDefault();

    if (!adminPassword.trim()) {
      setToast("Masukkan password admin.");
      return;
    }

    const isUnlocked = await refreshAdmin(adminPassword);
    if (!isUnlocked) {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      setAdminUnlocked(false);
      return;
    }

    window.localStorage.setItem(ADMIN_SESSION_KEY, adminPassword);
    setAdminUnlocked(true);
  }

  async function handleCopyMailboxLink(routeTokenToCopy) {
    await copyText(buildMailboxLink(routeTokenToCopy));
    setToast("Link berhasil disalin.");
  }

  async function handleCopyCurrentLink() {
    if (!mailbox?.route_token) {
      setToast("Link akses belum tersedia.");
      return;
    }

    await copyText(buildMailboxLink(mailbox.route_token));
    setToast("Link berhasil disalin.");
  }

  async function handleCopyLatestOtp() {
    for (const message of inbox) {
      const otp = extractOtp(message);
      if (otp) {
        await copyText(otp);
        setToast("Kode berhasil disalin.");
        return;
      }
    }

    setToast("Belum ada kode verifikasi.");
  }

  async function handleCopyMailboxEmail(email) {
    if (!email) {
      setToast("Email tidak tersedia.");
      return;
    }

    await copyText(email);
    setToast("Email berhasil disalin.");
  }

  async function handleCreateMailbox(event) {
    event.preventDefault();

    const localPart = normalizeLocalPart(newMailboxLocalPart);
    if (!localPart) {
      setToast("Masukkan nama mailbox terlebih dahulu.");
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      const createdMailbox = {
        mailbox_id: `sample-${Date.now()}`,
        display_name: formatDisplayName(localPart),
        inbox_email: `${localPart}@${MAIL_DOMAIN}`,
        route_token: `${Date.now()}${Math.random().toString(16).slice(2, 18)}`,
        is_active: true,
        total_emails: 0,
        latest_received_at: null
      };

      setMailboxes((current) => [createdMailbox, ...current]);
      setNewMailboxLocalPart("");
      setToast("Mailbox berhasil dibuat.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc("create_admin_mailbox", {
      p_admin_password: adminPassword,
      p_local_part: localPart,
      p_display_name: formatDisplayName(localPart)
    });

    if (error) {
      setLoading(false);
      setToast(error.message || "Mailbox gagal dibuat.");
      return;
    }

    const createdMailbox = Array.isArray(data) ? data[0] : data;
    setNewMailboxLocalPart("");
    setToast(createdMailbox ? `${createdMailbox.inbox_email} berhasil dibuat.` : "Mailbox berhasil dibuat.");
    await refreshAdmin(adminPassword);
  }

  async function handleBulkGenerate() {
    const items = bulkNames
      .split(/\r?\n/)
      .map((line) => normalizeLocalPart(line.trim()))
      .filter(Boolean);

    if (!items.length) {
      setToast("Isi minimal satu local-part, satu baris satu mailbox.");
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      const preview = items.map((localPart, index) => ({
        mailbox_id: `preview-${index}-${localPart}`,
        display_name: formatDisplayName(localPart),
        inbox_email: `${localPart}@${MAIL_DOMAIN}`,
        route_token: `preview-${localPart}-${index}`,
        is_active: true,
        total_emails: 0,
        latest_received_at: null
      }));

      setGeneratedMailboxes(preview);
      setToast("Supabase belum aktif. Ini hanya preview hasil bulk.");
      return;
    }

    setBulkLoading(true);
    const { data, error } = await supabase.rpc("bulk_create_admin_mailboxes", {
      p_admin_password: adminPassword,
      p_items: items.map((local_part) => ({ local_part }))
    });

    if (error) {
      setBulkLoading(false);
      setToast(error.message || "Bulk generate gagal.");
      return;
    }

    const created = Array.isArray(data) ? data : [];
    setGeneratedMailboxes(created);
    setBulkNames("");
    setToast(`Berhasil membuat ${created.length} mailbox.`);
    setBulkLoading(false);
    await refreshAdmin(adminPassword);
  }

  async function handleCopyBulkLinks() {
    if (!generatedMailboxes.length) {
      setToast("Belum ada hasil bulk generate.");
      return;
    }

    const text = generatedMailboxes
      .map((mailbox) => `${mailbox.inbox_email} | ${buildMailboxLink(mailbox.route_token)}`)
      .join("\n");

    await copyText(text);
    setToast("Hasil bulk berhasil disalin.");
  }

  if (mode === "admin" && !adminUnlocked) {
    return (
      <AdminLogin
        adminPassword={adminPassword}
        setAdminPassword={setAdminPassword}
        onSubmit={handleAdminUnlock}
        toast={toast}
      />
    );
  }

  if (mode === "mailbox") {
    return (
      <MailboxView
        mailbox={mailbox}
        inbox={inbox}
        loading={loading}
        status={status}
        toast={toast}
        onRefresh={refreshMailbox}
        onCopyLink={handleCopyCurrentLink}
        onCopyOtp={handleCopyLatestOtp}
      />
    );
  }

  return (
    <AdminView
      adminPassword={adminPassword}
      mailboxes={mailboxes}
      recentEmails={recentEmails}
      loading={loading}
      bulkLoading={bulkLoading}
      status={status}
      toast={toast}
      onRefresh={() => refreshAdmin(adminPassword)}
      newMailboxLocalPart={newMailboxLocalPart}
      onMailboxLocalPartChange={(value) => setNewMailboxLocalPart(normalizeLocalPart(value))}
      onCreateMailbox={handleCreateMailbox}
      onCopyMailboxLink={handleCopyMailboxLink}
      onCopyMailboxEmail={handleCopyMailboxEmail}
      bulkNames={bulkNames}
      onBulkNamesChange={setBulkNames}
      onBulkGenerate={handleBulkGenerate}
      onCopyBulkLinks={handleCopyBulkLinks}
      generatedMailboxes={generatedMailboxes}
    />
  );
}

export default App;
