const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const apiBaseUrl = window.METRICFLOW_API_BASE_URL || "";
const appUrl = window.METRICFLOW_CLOUDFLARE_APP_URL || window.location.origin;
const sessionKey = "metricflow.session";
const cookieConsentKey = "metrillix.cookieConsent";

let session = readSession();
let dashboardState = null;
let linkedInState = null;
let linkedInOAuthStatus = null;

const routes = {
  "/": WelcomePage,
  "/signup": SignupPage,
  "/login": LoginPage,
  "/forgot-password": ForgotPasswordPage,
  "/reset-password": ResetPasswordPage,
  "/cookie-policy": CookiePolicyPage,
  "/dashboard/onboarding": OnboardingPage,
  "/dashboard": Dashboard
};

function readSession() {
  return JSON.parse(localStorage.getItem(sessionKey) || "null") || {};
}

function saveSession(nextSession) {
  session = { ...session, ...nextSession };
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

function clearSession() {
  session = {};
  localStorage.removeItem(sessionKey);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function navigate(path) {
  const shouldScrollTop = path === "/" || window.location.pathname === path;
  window.history.pushState({}, "", path);
  render();
  if (shouldScrollTop) {
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}

function captureOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("connector") === "connected") {
    window.history.replaceState({}, "", "/dashboard/onboarding");
    showToast("LinkedIn connected");
  }
  if (params.get("connector") === "error") {
    showToast(params.get("message") || "LinkedIn connection failed");
    window.history.replaceState({}, "", "/dashboard/onboarding");
  }
}

async function api(path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (session.token) headers.authorization = `Bearer ${session.token}`;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.message;
    throw new Error(message || "Request failed");
  }
  return payload;
}

async function authenticate(mode, form) {
  const endpoints = mode === "signup" ? ["/api/signup", "/api/auth/signup"] : ["/api/login", "/api/auth/login"];
  const payload = Object.fromEntries(new FormData(form).entries());
  const result = await postFirstAvailable(endpoints, payload);
  saveSession({
    name: result.name || payload.name || session.name || "",
    email: result.email || payload.email,
    token: result.token || result.accessToken || session.token || "",
    accountId: result.userId || result.id || session.accountId || ""
  });
  navigate("/dashboard/onboarding");
}

async function requestPasswordReset(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  await api("/api/password/forgot", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  showToast("If an account exists, reset instructions will be sent.");
  navigate("/login");
}

async function submitPasswordReset(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.password !== payload.confirmPassword) throw new Error("Passwords do not match");
  await api("/api/password/reset", {
    method: "POST",
    body: JSON.stringify({ token: payload.token, password: payload.password })
  });
  showToast("Password updated. Log in with your new password.");
  navigate("/login");
}

async function postFirstAvailable(endpoints, payload) {
  let lastError;
  for (const endpoint of endpoints) {
    try {
      return await api(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch (error) {
      lastError = error;
      if (!/not found|route/i.test(error.message)) throw error;
    }
  }
  throw lastError || new Error("Authentication endpoint unavailable");
}

async function loadLinkedInState() {
  try {
    linkedInState = await api("/api/linkedin/organizations");
  } catch {
    linkedInState = { organizations: [], selectedOrganization: null };
  }
  return linkedInState;
}

async function loadLinkedInOAuthStatus() {
  try {
    const result = await api("/api/connectors");
    linkedInOAuthStatus = (result.connectors || []).find((connector) => connector.id === "linkedin") || null;
  } catch {
    linkedInOAuthStatus = null;
  }
  return linkedInOAuthStatus;
}

async function loadDashboardState() {
  dashboardState = await api("/api/state");
  return dashboardState;
}

function TopNav({ right = "login" } = {}) {
  const links = right === "dashboard"
    ? `<button class="nav-link" data-route="/dashboard">Dashboard</button><button class="nav-link" data-logout>Log out</button>`
    : `
      <button class="nav-link" data-route="/">Home</button>
      <a class="nav-link" href="#about">About</a>
      <a class="nav-link" href="#privacy">Privacy Policy</a>
      <a class="nav-link" href="#terms">Terms</a>
      <button class="nav-link" data-route="/cookie-policy">Cookies</button>
      <button class="nav-link" data-route="/login">Log In</button>
      <button class="nav-signup" data-route="/signup">Sign Up</button>
    `;

  return `
    <header class="top-nav">
      <a class="brand-link" href="/" data-route="/" aria-label="MetricFlow home">
        <img class="brand-logo" src="/assets/metric-flow-logo.png" alt="MetricFlow">
      </a>
      <nav>${links}</nav>
    </header>
  `;
}

function WelcomePage() {
  return `
    ${TopNav()}
    <main class="marketing-page">
      <section class="front-hero" id="home">
        <h1>Analytics for LinkedIn, Simplified</h1>
        <p>Track your LinkedIn performance with clean, actionable insights designed for creators, founders, and marketing teams.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get Started</button>
          <button class="text-button" data-route="/login">Log In</button>
        </div>
      </section>

      <section class="front-section" id="features">
        <div class="section-intro">
          <p class="eyebrow">Features</p>
          <h2>Understand what works, what grows, and what deserves your next move.</h2>
        </div>
        <div class="feature-grid">
          <article class="feature-card">
            <span class="feature-placeholder">01</span>
            <h3>Post Performance Insights</h3>
            <p>See exactly which posts resonate with your audience. Track impressions, clicks, reactions, comments, and shares — all in one place.</p>
          </article>
          <article class="feature-card">
            <span class="feature-placeholder">02</span>
            <h3>Audience Growth Tracking</h3>
            <p>Understand who’s following your Page, how your audience is evolving, and what drives growth over time.</p>
          </article>
          <article class="feature-card">
            <span class="feature-placeholder">03</span>
            <h3>Engagement Analytics</h3>
            <p>Measure engagement quality, identify trends, and discover the content formats that consistently perform best.</p>
          </article>
        </div>
      </section>

      <section class="front-section about-section" id="about">
        <p class="eyebrow">About Us</p>
        <h2>Metrillix helps professionals understand their LinkedIn impact.</h2>
        <p>We built Metrillix because creators and businesses deserve analytics that are simple, accurate, and genuinely useful. Our platform turns raw LinkedIn data into clear insights — helping you grow your audience, improve your content strategy, and make smarter decisions with confidence.</p>
      </section>

      <section class="front-section policy-section" id="privacy">
        <p class="eyebrow">Privacy Policy</p>
        <p>Metrillix collects only the data you explicitly authorize through LinkedIn OAuth. We never access personal messages, private data, or anything outside the permissions you grant. Your analytics belong to you — we do not sell, share, or aggregate your data across accounts. You can revoke access at any time through LinkedIn’s security settings.</p>
      </section>

      <section class="front-section policy-section" id="terms">
        <p class="eyebrow">Terms of Service</p>
        <p>By using Metrillix, you agree to use the platform responsibly and in compliance with LinkedIn’s API terms. You retain full ownership of your content and analytics. We provide the service “as is” and continuously improve it to ensure accuracy, reliability, and security.</p>
      </section>

      <section class="front-cta">
        <h2>Start analyzing your LinkedIn today</h2>
        <p>Create your account and connect your LinkedIn Page in seconds.</p>
        <button class="primary-button" data-route="/signup">Create Account</button>
      </section>
    </main>
    <footer class="front-footer">
      <nav>
        <a href="#about">About Us</a>
        <a href="#privacy">Privacy Policy</a>
        <a href="#terms">Terms of Service</a>
        <button class="footer-link" data-route="/cookie-policy">Cookie Policy</button>
        <a href="mailto:hello@metrillix.com">Contact</a>
      </nav>
      <p>© 2026 Metrillix — LinkedIn Analytics for Professionals</p>
    </footer>
  `;
}

function CookiePolicyPage() {
  return `
    ${TopNav()}
    <main class="page-shell policy-page">
      <section>
        <p class="eyebrow">Cookie Policy</p>
        <h1>How Metrillix uses cookies</h1>
        <p class="muted">Metrillix uses essential cookies to keep your account secure, remember your session, and protect authenticated dashboard requests. These cookies are needed for the product to work.</p>
      </section>
      <section class="policy-block">
        <h2>Essential cookies</h2>
        <p>We set a secure session cookie after signup or login. It helps verify that dashboard and API requests belong to your Metrillix account. The cookie is HttpOnly, Secure, SameSite=Lax, and expires automatically.</p>
      </section>
      <section class="policy-block">
        <h2>Preference cookies</h2>
        <p>We store your cookie notice choice in your browser so the notice does not keep appearing. This preference does not contain account analytics or LinkedIn data.</p>
      </section>
      <section class="policy-block">
        <h2>LinkedIn cookies</h2>
        <p>When you connect LinkedIn, LinkedIn may use its own cookies on linkedin.com to authenticate your LinkedIn account. Metrillix does not control LinkedIn cookies.</p>
      </section>
    </main>
    ${CookieBanner()}
  `;
}

function SignupPage() {
  return `
    ${TopNav()}
    <main class="page-shell auth-shell">
      <section class="auth-card">
        <p class="eyebrow">Create account</p>
        <h1>Start with MetricFlow</h1>
        <form data-auth="signup">
          <label>Name<input name="name" autocomplete="name" required></label>
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
          <button class="primary-button full" type="submit">Sign up</button>
        </form>
        <p class="muted">Already have an account? <button class="inline-link" data-route="/login">Log in</button></p>
      </section>
    </main>
  `;
}

function LoginPage() {
  return `
    ${TopNav()}
    <main class="page-shell auth-shell">
      <section class="auth-card">
        <p class="eyebrow">Welcome back</p>
        <h1>Log in</h1>
        <form data-auth="login">
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="primary-button full" type="submit">Log in</button>
        </form>
        <p class="muted"><button class="inline-link" data-route="/forgot-password">Forgot your password?</button></p>
        <p class="muted">New to MetricFlow? <button class="inline-link" data-route="/signup">Create an account</button></p>
      </section>
    </main>
  `;
}

function ForgotPasswordPage() {
  return `
    ${TopNav()}
    <main class="page-shell auth-shell">
      <section class="auth-card">
        <p class="eyebrow">Password reset</p>
        <h1>Reset your password</h1>
        <p class="muted">Enter your account email and we’ll send a secure reset link if the account exists.</p>
        <form data-password-forgot>
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <button class="primary-button full" type="submit">Send reset link</button>
        </form>
        <p class="muted"><button class="inline-link" data-route="/login">Back to log in</button></p>
      </section>
    </main>
  `;
}

function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  return `
    ${TopNav()}
    <main class="page-shell auth-shell">
      <section class="auth-card">
        <p class="eyebrow">New password</p>
        <h1>Choose a new password</h1>
        <p class="muted">Use at least 8 characters. Your old password cannot be recovered.</p>
        <form data-password-reset>
          <input name="token" type="hidden" value="${escapeAttribute(token)}">
          <label>New password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
          <label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="8"></label>
          <button class="primary-button full" type="submit">Update password</button>
        </form>
        <p class="muted"><button class="inline-link" data-route="/login">Back to log in</button></p>
      </section>
    </main>
  `;
}

function OnboardingPage() {
  return `
    ${TopNav({ right: "dashboard" })}
    <main class="page-shell narrow-shell">
      <section class="step-card" id="onboardingContent">
        <p class="eyebrow">Onboarding</p>
        <h1>Preparing your LinkedIn workspace</h1>
        <p class="muted">Checking your connection and organization access.</p>
      </section>
    </main>
  `;
}

function ConnectLinkedInStep() {
  const helper = linkedInOAuthStatus?.configured === false
    ? "Connect through the MetricFlow backend. If OAuth setup is still missing, the backend will show the required app configuration without storing any user tokens in the frontend."
    : "Connect the LinkedIn account that administers the organizations you want to analyze.";
  const connectUrl = `${apiBaseUrl}/api/connectors/linkedin/connect?session=${encodeURIComponent(session.token || "")}`;
  const disconnectButton = linkedInState?.connected
    ? `<button class="secondary-button" data-disconnect-linkedin>Disconnect LinkedIn</button>`
    : "";
  return `
    <p class="eyebrow">Step 1</p>
    <h1>Connect LinkedIn</h1>
    <p class="muted">${helper}</p>
    <div class="button-row">
      <a class="primary-button link-button" href="${connectUrl}" data-connect-linkedin>${linkedInState?.connected ? "Reconnect LinkedIn" : "Connect LinkedIn"}</a>
      ${disconnectButton}
    </div>
  `;
}

function SelectOrganizationStep(organizations, selectedOrganization) {
  const items = organizations.map((organization) => `
    <button class="org-option ${organization === selectedOrganization ? "selected" : ""}" data-organization="${organization}">
      <span>${organization}</span>
      <small>${organization === selectedOrganization ? "Selected" : "Choose"}</small>
    </button>
  `).join("");

  return `
    <p class="eyebrow">Step 2</p>
    <h1>Select organization</h1>
    <p class="muted">Choose the LinkedIn organization MetricFlow should use for post ingestion and analytics.</p>
    <div class="org-list">${items}</div>
    <div class="button-row">
      <button class="secondary-button" data-disconnect-linkedin>Disconnect LinkedIn</button>
    </div>
  `;
}

function DashboardReadyStep() {
  return `
    <p class="eyebrow">Step 3</p>
    <h1>Your dashboard is ready</h1>
    <p class="muted">MetricFlow has an active LinkedIn organization. You can now load the analytics dashboard.</p>
    <button class="primary-button" data-route="/dashboard">Open dashboard</button>
  `;
}

function Dashboard() {
  return `
    ${TopNav({ right: "dashboard" })}
    <main class="page-shell dashboard-shell">
      <section class="dashboard-hero">
        <div>
          <p class="eyebrow">Dashboard</p>
          <h1>LinkedIn analytics</h1>
          <p class="muted" id="dashboardOrg">Loading selected organization.</p>
        </div>
        <div class="button-row">
          <button class="primary-button" data-sync-linkedin>Sync LinkedIn</button>
          <button class="secondary-button" data-disconnect-linkedin>Disconnect LinkedIn</button>
        </div>
      </section>
      <section class="sync-panel" id="syncStatusPanel"></section>
      <section class="metrics-grid" id="metricsGrid"></section>
      <section class="table-section">
        <div class="section-heading">
          <h2>Recent posts</h2>
          <p class="muted">Normalized from the selected LinkedIn organization.</p>
        </div>
        <div class="post-list" id="postList"></div>
      </section>
    </main>
  `;
}

async function hydrateOnboarding() {
  const container = document.querySelector("#onboardingContent");
  if (!container) return;
  await loadLinkedInOAuthStatus();
  const details = await loadLinkedInState();
  const organizations = details.organizations || [];
  if (!organizations.length) {
    container.innerHTML = ConnectLinkedInStep();
    return;
  }
  if (!details.selectedOrganization) {
    container.innerHTML = SelectOrganizationStep(organizations, details.selectedOrganization);
    return;
  }
  navigate("/dashboard");
}

async function hydrateDashboard() {
  const details = await loadLinkedInState();
  if (!details.selectedOrganization) {
    navigate("/dashboard/onboarding");
    return;
  }
  document.querySelector("#dashboardOrg").textContent = details.selectedOrganization;

  const state = await loadDashboardState();
  const summary = state.summary || {};
  document.querySelector("#syncStatusPanel").innerHTML = SyncStatusPanel(state.linkedin?.sync, summary);
  const cards = [
    ["Tracked posts", summary.trackedPosts || 0],
    ["Reach", summary.totalReach || 0],
    ["Engagements", summary.totalEngagement || 0],
    ["Conversions", summary.totalConversions || 0]
  ];

  document.querySelector("#metricsGrid").innerHTML = cards.map(([label, value]) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${Number(value || 0).toLocaleString()}</strong>
    </article>
  `).join("");

  const posts = state.postRankings || [];
  document.querySelector("#postList").innerHTML = posts.length ? posts.slice(0, 8).map((post) => `
    <article class="post-row">
      <div>
        <strong>${post.title || post.post_id}</strong>
        <span>${post.mediaType || "post"}</span>
      </div>
      <small>${Number(post.metrics?.engagements || 0).toLocaleString()} engagements</small>
    </article>
  `).join("") : `<p class="empty-state">No posts yet. Sync LinkedIn to fetch analytics for the selected organization.</p>`;
}

function SyncStatusPanel(sync, summary = {}) {
  if (sync?.status === "failed") {
    return `
      <div>
        <span>Connection health</span>
        <strong>Sync failed</strong>
      </div>
      <p>${sync.lastError || "LinkedIn sync failed."} ${sync.lastAttemptedAt ? `Last attempted ${formatDateTime(sync.lastAttemptedAt)}.` : ""} Reconnect LinkedIn or confirm the selected company page has analytics permissions.</p>
    `;
  }

  if (!sync?.lastIngestedAt) {
    return `
      <div>
        <span>Connection health</span>
        <strong>Not synced yet</strong>
      </div>
      <p>LinkedIn is connected. Run sync to fetch company page posts and analytics.</p>
    `;
  }

  const diagnostics = sync.diagnostics || {};
  const metricCoverage = [
    `${diagnostics.postsWithReach || 0} reach`,
    `${diagnostics.postsWithEngagements || 0} engagement`,
    `${diagnostics.postsWithClicks || 0} clicks`
  ].join(" / ");

  return `
    <div>
      <span>Connection health</span>
      <strong>${formatDateTime(sync.lastIngestedAt)}</strong>
    </div>
    <p>${sync.fetched || 0} fetched, ${sync.saved || 0} saved, ${summary.trackedPosts || 0} tracked posts. Metric coverage: ${metricCoverage}.</p>
  `;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function wirePageEvents() {
  document.querySelectorAll("[data-auth]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await authenticate(form.dataset.auth, form);
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-password-forgot]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await requestPasswordReset(form);
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-password-reset]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await submitPasswordReset(form);
      } catch (error) {
        showToast(error.message);
      }
    });
  });

}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

async function handleAppClick(event) {
  if (event.target.closest("[data-accept-cookies]")) {
    localStorage.setItem(cookieConsentKey, "accepted");
    renderCookieBanner();
    return;
  }

  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    event.preventDefault();
    navigate(routeTarget.dataset.route);
    return;
  }

  if (event.target.closest("[data-logout]")) {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    clearSession();
    navigate("/");
    return;
  }

  if (event.target.closest("[data-connect-linkedin]")) {
    event.preventDefault();
    // LinkedIn client id/secret never live in the frontend. The Worker owns
    // OAuth configuration and returns a LinkedIn authorization redirect.
    window.location.href = `${apiBaseUrl}/api/connectors/linkedin/connect?session=${encodeURIComponent(session.token || "")}`;
    return;
  }

  if (event.target.closest("[data-sync-linkedin]")) {
    try {
      const result = await api("/api/connectors/linkedin/sync", { method: "POST" });
      await hydrateDashboard();
      showToast(`LinkedIn synced: ${result.saved || 0} posts saved`);
    } catch (error) {
      await hydrateDashboard().catch(() => {});
      showToast(error.message);
    }
  }

  if (event.target.closest("[data-disconnect-linkedin]")) {
    try {
      await api("/api/connectors/linkedin/disconnect", { method: "POST" });
      linkedInState = { connected: false, organizations: [], selectedOrganization: null };
      dashboardState = null;
      showToast("LinkedIn disconnected");
      navigate("/dashboard/onboarding");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const organizationTarget = event.target.closest("[data-organization]");
  if (organizationTarget) {
    try {
      const result = await api("/api/linkedin/select-organization", {
        method: "POST",
        body: JSON.stringify({ organizationUrn: organizationTarget.dataset.organization })
      });
      linkedInState = result;
      navigate("/dashboard");
    } catch (error) {
      showToast(error.message);
    }
  }
}

async function render() {
  const path = window.location.pathname;
  const route = routes[path] ? path : "/";
  const isPrivate = route.startsWith("/dashboard");

  if (isPrivate && !session.email && !session.accountId) {
    window.history.replaceState({}, "", "/login");
    app.innerHTML = LoginPage();
    wirePageEvents();
    return;
  }

  app.innerHTML = routes[route]();

  wirePageEvents();

  try {
    if (route === "/dashboard/onboarding") await hydrateOnboarding();
    if (route === "/dashboard") await hydrateDashboard();
  } catch (error) {
    showToast(error.message);
  }
  renderCookieBanner();
}

window.addEventListener("popstate", render);
document.addEventListener("click", handleAppClick);
captureOAuthReturn();
render();

function CookieBanner() {
  return `
    <aside class="cookie-banner" id="cookieBanner" hidden>
      <p>Metrillix uses essential cookies for secure login and dashboard sessions. We also remember this notice choice.</p>
      <div class="button-row">
        <button class="primary-button" data-accept-cookies>Accept</button>
        <button class="secondary-button" data-route="/cookie-policy">Cookie Policy</button>
      </div>
    </aside>
  `;
}

function renderCookieBanner() {
  let banner = document.querySelector("#cookieBanner");
  if (!banner) {
    document.body.insertAdjacentHTML("beforeend", CookieBanner());
    banner = document.querySelector("#cookieBanner");
  }
  banner.hidden = localStorage.getItem(cookieConsentKey) === "accepted";
}
