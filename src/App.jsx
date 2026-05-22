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

function AdminLogin({ adminPassword, setAdminPassword, onSubmit, toast }) {
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
          <h1>Dashboard daftar mailbox</h1>
          <p className="hero-copy">
            Root berisi daftar semua email inbox dan email masuk terbaru. Link user memakai path acak `/mail/token-acak`.
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
            Masuk admin
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
            <p className="brand-title">MailDesk OTP</p>
            <span className="brand-subtitle">Mailbox User</span>
          </div>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Status</span>
          <strong>{status}</strong>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Inbox aktif</span>
          <strong>{mailbox?.display_name || "-"}</strong>
          <span>{mailbox?.inbox_email || "-"}</span>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">OTP terbaru</span>
          <strong>{latestOtp?.code || "Belum ada"}</strong>
          <span>{latestOtp ? formatTime(latestOtp.receivedAt) : "Belum ada email OTP."}</span>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <p className="hero-kicker">Inbox User</p>
            <h1>Dashboard mail untuk satu user</h1>
            <p className="hero-copy">
              Halaman ini hanya membaca inbox dari token path yang dipakai. Cocok untuk inbox OTP per user.
            </p>
          </div>
          <div className="hero-actions">
            <button className="button button-secondary" type="button" onClick={onCopyLink}>
              Copy link
            </button>
            <button className="button button-secondary" type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Memuat..." : "Refresh inbox"}
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card accent-card">
            <span>OTP terbaru</span>
            <strong>{latestOtp?.code || "Belum ada"}</strong>
            <p>{latestOtp ? `${latestOtp.sender} - ${formatTime(latestOtp.receivedAt)}` : "Belum ada email OTP yang cocok."}</p>
            <button className="button" type="button" onClick={onCopyOtp}>
              Copy OTP
            </button>
          </article>

          <article className="stat-card">
            <span>Mailbox email</span>
            <strong>{mailbox?.inbox_email || "-"}</strong>
            <p>{mailbox?.route_token ? `/mail/${mailbox.route_token}` : "Token belum tersedia."}</p>
          </article>

          <article className="stat-card">
            <span>Total email</span>
            <strong>{inbox.length}</strong>
            <p>{inbox[0] ? formatTime(inbox[0].received_at) : "Belum ada email masuk."}</p>
          </article>
        </section>

        <section className="content-grid single-column">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Kotak masuk</h2>
                <p>Inbox terbaru untuk mailbox ini.</p>
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

function AdminView({
  adminPassword,
  mailboxes,
  recentEmails,
  loading,
  status,
  toast,
  onRefresh,
  newMailboxLocalPart,
  onMailboxLocalPartChange,
  onCreateMailbox,
  onCopyMailboxLink
}) {
  const totalActive = mailboxes.filter((mailbox) => mailbox.is_active).length;
  const latestEmail = recentEmails[0];
  const mailboxPreview = newMailboxLocalPart ? `${newMailboxLocalPart}@${MAIL_DOMAIN}` : `nama-user@${MAIL_DOMAIN}`;

  return (
    <div className="app-shell admin-layout">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">M</div>
          <div>
            <p className="brand-title">MailDesk OTP</p>
            <span className="brand-subtitle">Admin Dashboard</span>
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
          <strong>{recentEmails.length} email terbaru</strong>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-label">Akun admin</span>
          <strong>Password aktif</strong>
          <span>{adminPassword ? "Session tersimpan di browser." : "Belum aktif."}</span>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <p className="hero-kicker">Index Admin</p>
            <h1>Daftar semua email dan kotak masuk user</h1>
            <p className="hero-copy">
              Root dashboard menampilkan semua mailbox, alamat inbox yang dipakai, link dashboard user, dan email masuk terbaru lintas mailbox.
            </p>
          </div>
          <div className="hero-actions">
            <button className="button button-secondary" type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Memuat..." : "Refresh admin"}
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card accent-card">
            <span>Total mailbox</span>
            <strong>{mailboxes.length}</strong>
            <p>{totalActive} mailbox aktif untuk menerima email.</p>
          </article>

          <article className="stat-card">
            <span>Email terbaru</span>
            <strong>{recentEmails.length}</strong>
            <p>{latestEmail ? `${latestEmail.mailbox_name} - ${formatTime(latestEmail.received_at)}` : "Belum ada email masuk."}</p>
          </article>

          <article className="stat-card">
            <span>OTP terdeteksi</span>
            <strong>{recentEmails.filter((item) => Boolean(extractOtp(item))).length}</strong>
            <p>Diambil dari email terbaru lintas mailbox.</p>
          </article>
        </section>

        <section className="content-grid admin-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>List mailbox</h2>
                <p>Semua alamat email inbox dan link dashboard user.</p>
              </div>
            </div>

            <form className="create-mailbox-form" onSubmit={onCreateMailbox}>
              <label className="field mailbox-field">
                <span>Buat email user baru</span>
                <input
                  value={newMailboxLocalPart}
                  onChange={(event) => onMailboxLocalPartChange(event.target.value)}
                  placeholder="contoh: riski-ridho"
                />
              </label>
              <div className="mailbox-preview-row">
                <p className="mailbox-meta">Email otomatis: {mailboxPreview}</p>
                <button className="button" type="submit" disabled={loading}>
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
                    <p className="mailbox-meta">Email masuk: {mailbox.total_emails || 0}</p>
                    <p className="mailbox-meta">Terakhir: {formatTime(mailbox.latest_received_at)}</p>
                    <div className="mailbox-actions">
                      <code className="token-chip">/mail/{mailbox.route_token}</code>
                      <button className="button button-secondary" type="button" onClick={() => onCopyMailboxLink(mailbox.route_token)}>
                        Copy link
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-box">Belum ada mailbox di database.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Email terbaru</h2>
                <p>Kotak masuk lintas semua user.</p>
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
                          {otp ? `OTP ${otp}` : "Tanpa OTP"}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-box">Belum ada email terbaru.</div>
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
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Menyiapkan dashboard");
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
      setStatus(!supabase ? "Mode contoh" : "Token mailbox belum ada");
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
      setStatus("RPC mailbox gagal");
      setToast(mailboxError?.message || inboxError?.message || "Mailbox gagal dimuat.");
      setLoading(false);
      return;
    }

    const currentMailbox = Array.isArray(mailboxData) ? mailboxData[0] : mailboxData;
    if (!currentMailbox) {
      setMailbox(null);
      setInbox([]);
      setStatus("Mailbox tidak ditemukan");
      setLoading(false);
      return;
    }

    setMailbox(currentMailbox);
    setInbox(Array.isArray(inboxData) ? inboxData : []);
    setStatus("Mailbox aktif");
    setLoading(false);
  }

  async function refreshAdmin(password) {
    setLoading(true);
    const supabase = getSupabaseClient();

    if (!password) {
      setStatus("Password admin dibutuhkan");
      setLoading(false);
      return;
    }

    if (!supabase) {
      setMailboxes(sampleMailboxes);
      setRecentEmails(sampleInbox);
      setStatus("Mode contoh");
      setLoading(false);
      return true;
    }

    const { data: isValid, error: passwordError } = await supabase.rpc("is_valid_admin_password", {
      p_admin_password: password
    });

    if (passwordError || !isValid) {
      setMailboxes([]);
      setRecentEmails([]);
      setStatus("Password admin salah");
      setToast(passwordError?.message || "Password admin salah.");
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
      setStatus("Admin query gagal");
      setToast(mailboxError?.message || recentError?.message || "Dashboard admin gagal dimuat.");
      setLoading(false);
      return false;
    }

    setMailboxes(Array.isArray(mailboxData) ? mailboxData : []);
    setRecentEmails(Array.isArray(recentData) ? recentData : []);
    setStatus("Admin aktif");
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
    setToast("Link mailbox disalin.");
  }

  async function handleCopyCurrentLink() {
    if (!mailbox?.route_token) {
      setToast("Link mailbox belum tersedia.");
      return;
    }

    await copyText(buildMailboxLink(mailbox.route_token));
    setToast("Link mailbox disalin.");
  }

  async function handleCopyLatestOtp() {
    for (const message of inbox) {
      const otp = extractOtp(message);
      if (otp) {
        await copyText(otp);
        setToast("OTP disalin.");
        return;
      }
    }

    setToast("Belum ada OTP yang terdeteksi.");
  }

  function normalizeLocalPart(value) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleCreateMailbox(event) {
    event.preventDefault();

    const localPart = normalizeLocalPart(newMailboxLocalPart);
    if (!localPart) {
      setToast("Isi nama email user dulu.");
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
      setToast("Mailbox contoh dibuat.");
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
    setToast(createdMailbox ? `Mailbox ${createdMailbox.inbox_email} dibuat.` : "Mailbox dibuat.");
    await refreshAdmin(adminPassword);
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
      status={status}
      toast={toast}
      onRefresh={() => refreshAdmin(adminPassword)}
      newMailboxLocalPart={newMailboxLocalPart}
      onMailboxLocalPartChange={(value) => setNewMailboxLocalPart(normalizeLocalPart(value))}
      onCreateMailbox={handleCreateMailbox}
      onCopyMailboxLink={handleCopyMailboxLink}
    />
  );
}

export default App;
