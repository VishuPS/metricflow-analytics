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
let currentDraftFigure = null;

const routes = {
  "/": WelcomePage,
  "/signup": SignupPage,
  "/login": LoginPage,
  "/forgot-password": ForgotPasswordPage,
  "/reset-password": ResetPasswordPage,
  "/cookie-policy": CookiePolicyPage,
  "/dashboard/onboarding": OnboardingPage,
  "/create-post": CreatePostPage,
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
        <img class="brand-logo" src="/assets/metric-flow-logo.png?v=20260525-metrillix-logo" alt="Metrillix">
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
  const items = organizations.map((organization) => {
    const urn = organizationUrn(organization);
    const name = organizationName(organization);
    const selected = urn === selectedOrganization;
    return `
      <article class="org-option ${selected ? "selected" : ""}" data-organization="${escapeAttribute(urn)}">
        <div class="org-copy">
          <span>${escapeHtml(name)}</span>
          <small>${selected ? "Selected page" : "LinkedIn company page"}</small>
        </div>
        <label class="org-name-field">Page name
          <input data-organization-name value="${escapeAttribute(name)}" placeholder="Company or client name">
        </label>
        <div class="org-actions">
          <button class="secondary-button" data-select-organization>Use page</button>
          <button class="text-button" data-edit-organization-name>Edit name</button>
          <button class="secondary-button" data-save-organization-name>Save name</button>
        </div>
      </article>
    `;
  }).join("");

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
          <button class="secondary-button" data-route="/create-post">Create post</button>
          <button class="secondary-button" data-route="/dashboard/onboarding">Manage pages</button>
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

function CreatePostPage() {
  return `
    ${TopNav({ right: "dashboard" })}
    <main class="page-shell create-post-shell">
      <section class="composer-panel">
        <p class="eyebrow">Create Post</p>
        <h1>Draft a LinkedIn post</h1>
        <p class="muted">Use your page signals first, then check market signals when LinkedIn exposes enough public ad text.</p>
        <form class="composer-form" data-draft-form>
          <input type="hidden" name="draftId">
          <label>Draft name
            <input name="title" placeholder="Name this draft">
          </label>
          <label>Post idea
            <input name="topic" placeholder="What should this post be about?">
          </label>
          <label>Draft
            <textarea name="body" rows="12" placeholder="Write your LinkedIn post draft here."></textarea>
          </label>
          <label>Add figure
            <input name="figure" type="file" accept="image/*" data-draft-figure>
          </label>
          <div class="figure-preview" id="draftFigurePreview">
            <p class="empty-state">No figure attached.</p>
          </div>
          <div class="button-row">
            <button class="primary-button" type="submit">Save draft</button>
            <button class="secondary-button" type="button" data-new-draft>New draft</button>
            <button class="secondary-button" type="button" data-route="/dashboard">Back to dashboard</button>
          </div>
        </form>
        <section class="draft-list-panel">
          <div class="section-heading">
            <h2>Saved drafts</h2>
            <p class="muted">Drafts stay inside Metrillix until publishing is added later.</p>
          </div>
          <div class="draft-list" id="draftList">
            <p class="empty-state">Loading drafts.</p>
          </div>
        </section>
      </section>
      ${AdInspirationPanel()}
    </main>
  `;
}

function AdInspirationPanel() {
  return `
    <aside class="ad-inspiration-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Inspiration</p>
          <h2>Post inspiration</h2>
        </div>
      </div>
      <p class="muted">Use synced page performance for reliable signals. Market signals are shown only when LinkedIn exposes public ad text.</p>
      <div class="inspiration-tabs" role="tablist">
        <button class="active" type="button" data-inspiration-tab="page">Your page</button>
        <button type="button" data-inspiration-tab="market">Market</button>
      </div>
      <div class="inspiration-tab-panel active" data-inspiration-panel="page">
        <div class="ad-inspiration-list" id="pageInspirationList">
          <p class="empty-state">Loading your page signals.</p>
        </div>
      </div>
      <div class="inspiration-tab-panel" data-inspiration-panel="market">
        <form class="ad-search-form" data-ad-inspiration-form>
          <label>Keyword
            <input name="keyword" value="marketing automation" placeholder="marketing automation">
          </label>
          <label>Country
            <select name="countries">
              <option value="">All available countries</option>
              <option value="LK">Sri Lanka (LK)</option>
              <option value="US">United States (US)</option>
              <option value="GB">United Kingdom (GB)</option>
              <option value="IN">India (IN)</option>
              <option value="AU">Australia (AU)</option>
              <option value="CA">Canada (CA)</option>
              <option value="SG">Singapore (SG)</option>
              <option value="AE">United Arab Emirates (AE)</option>
              <option value="DE">Germany (DE)</option>
              <option value="FR">France (FR)</option>
              <option value="NL">Netherlands (NL)</option>
              <option value="IE">Ireland (IE)</option>
              <option value="MY">Malaysia (MY)</option>
              <option value="PH">Philippines (PH)</option>
            </select>
          </label>
          <button class="primary-button full" type="submit">Refresh market signals</button>
        </form>
        <a class="secondary-button ad-library-search-link" href="https://www.linkedin.com/ad-library/search" target="_blank" rel="noreferrer" data-ad-library-search-link>Open LinkedIn Ad Library search</a>
        <div class="ad-inspiration-list" id="adInspirationList">
          <p class="empty-state">Market signals load when you open this tab.</p>
        </div>
      </div>
    </aside>
  `;
}

async function hydrateOnboarding() {
  const container = document.querySelector("#onboardingContent");
  if (!container) return;
  await loadLinkedInOAuthStatus();
  const details = await loadLinkedInState();
  const organizations = details.organizationOptions || details.organizations || [];
  if (!organizations.length) {
    container.innerHTML = ConnectLinkedInStep();
    return;
  }
  container.innerHTML = SelectOrganizationStep(organizations, details.selectedOrganization);
}

async function hydrateDashboard(stateOverride = null) {
  const details = await loadLinkedInState();
  if (!details.selectedOrganization) {
    navigate("/dashboard/onboarding");
    return;
  }
  document.querySelector("#dashboardOrg").textContent = details.selectedOrganizationName || organizationName(details.selectedOrganization);

  const state = stateOverride || await loadDashboardState();
  if (stateOverride) dashboardState = stateOverride;
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
  document.querySelector("#postList").innerHTML = posts.length ? posts.slice(0, 8).map((post) => {
    const metrics = {
      reach: post.reach ?? post.metrics?.reach,
      impressions: post.impressions,
      engagements: post.engagements ?? post.metrics?.engagements,
      clicks: post.clicks,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares
    };
    return `
    <article class="post-row">
      ${PostThumbnail(post)}
      <div class="post-main">
        <strong>${escapeHtml(post.title || post.text || post.post_id)}</strong>
        <span>${escapeHtml(formatDateTime(post.published_at || post.publishedAt))} - ${escapeHtml(post.mediaType || post.media_type || "post")}</span>
        <div class="post-metrics">
          ${PostMetric("Reach", metrics.reach)}
          ${PostMetric("Impressions", metrics.impressions)}
          ${PostMetric("Engagements", metrics.engagements)}
          ${PostMetric("Clicks", metrics.clicks)}
          ${PostMetric("Likes", metrics.likes)}
          ${PostMetric("Comments", metrics.comments)}
          ${PostMetric("Shares", metrics.shares)}
        </div>
      </div>
    </article>
  `;
  }).join("") : `<p class="empty-state">No posts yet. Sync LinkedIn to fetch analytics for the selected organization.</p>`;
}

function PostThumbnail(post) {
  const thumbnail = post.thumbnail_url || post.thumbnailUrl || post.imageUrl || "";
  if (thumbnail) {
    return `<a class="post-thumb" href="${escapeAttribute(post.url || "#")}" target="_blank" rel="noreferrer" aria-label="Open LinkedIn post"><img src="${escapeAttribute(thumbnail)}" alt=""></a>`;
  }
  return `<a class="post-thumb post-thumb-empty" href="${escapeAttribute(post.url || "#")}" target="_blank" rel="noreferrer" aria-label="Open LinkedIn post"><span>${escapeHtml(post.mediaType || post.media_type || "post")}</span></a>`;
}

function PostMetric(label, value) {
  const display = value === null || value === undefined ? "--" : Number(value || 0).toLocaleString();
  return `<span><b>${display}</b>${label}</span>`;
}

async function hydrateCreatePost() {
  const form = document.querySelector("[data-ad-inspiration-form]");
  if (form) updateAdLibrarySearchLink(form);
  currentDraftFigure = null;
  renderDraftFigurePreview();
  await loadDrafts();
  await loadPageInspiration();
}

async function loadDrafts() {
  const list = document.querySelector("#draftList");
  if (!list) return;
  list.innerHTML = `<p class="empty-state">Loading drafts.</p>`;
  try {
    const result = await api("/api/drafts");
    list.innerHTML = DraftList(result.drafts || []);
  } catch (error) {
    if (isMissingDraftApi(error)) {
      list.innerHTML = DraftList(loadLocalDrafts());
      return;
    }
    list.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "Unable to load drafts.")}</p>`;
  }
}

function DraftList(drafts) {
  if (!drafts.length) return `<p class="empty-state">No drafts saved yet.</p>`;
  return drafts.map((draft) => `
    <article class="draft-row" data-draft-id="${escapeAttribute(draft.id)}">
      ${draft.figure?.dataUrl ? `<img class="draft-thumb" src="${escapeAttribute(draft.figure.dataUrl)}" alt="">` : `<div class="draft-thumb draft-thumb-empty">Draft</div>`}
      <div class="draft-main">
        <strong>${escapeHtml(draft.title || "Untitled draft")}</strong>
        <span>${escapeHtml(draft.organizationName || "LinkedIn page")} - ${escapeHtml(draft.status || "draft")}</span>
        <small>${escapeHtml(formatDateTime(draft.createdAt))}</small>
      </div>
      <div class="draft-actions">
        ${draft.status === "published" && draft.linkedinPostUrl ? `<a class="secondary-button" href="${escapeAttribute(draft.linkedinPostUrl)}" target="_blank" rel="noreferrer">View post</a>` : ""}
        ${draft.status === "published" ? "" : `<button class="primary-button" type="button" data-publish-draft="${escapeAttribute(draft.id)}">Publish</button>`}
        <button class="secondary-button" type="button" data-edit-draft="${escapeAttribute(draft.id)}">Edit</button>
        <button class="text-button danger" type="button" data-delete-draft="${escapeAttribute(draft.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

async function saveDraft(form) {
  const data = new FormData(form);
  const draftId = String(data.get("draftId") || "").trim();
  const payload = {
    title: data.get("title"),
    topic: data.get("topic"),
    body: data.get("body"),
    figure: currentDraftFigure
  };
  let result;
  try {
    result = await api(draftId ? `/api/drafts/${encodeURIComponent(draftId)}` : "/api/drafts", {
      method: draftId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!isMissingDraftApi(error)) throw error;
    result = saveLocalDraft(draftId, payload);
  }
  form.elements.draftId.value = result.draft?.id || "";
  document.querySelector("#draftList").innerHTML = DraftList(result.drafts || []);
  showToast(result.local ? "Draft saved locally" : "Draft saved");
}

async function editDraft(draftId) {
  let result;
  try {
    result = await api("/api/drafts");
  } catch (error) {
    if (!isMissingDraftApi(error)) throw error;
    result = { drafts: loadLocalDrafts() };
  }
  const draft = (result.drafts || []).find((item) => item.id === draftId);
  if (!draft) throw new Error("Draft not found");
  const form = document.querySelector("[data-draft-form]");
  form.elements.draftId.value = draft.id || "";
  form.elements.title.value = draft.title || "";
  form.elements.topic.value = draft.topic || "";
  form.elements.body.value = draft.body || "";
  currentDraftFigure = draft.figure || null;
  form.elements.figure.value = "";
  renderDraftFigurePreview();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteDraft(draftId) {
  let result;
  try {
    result = await api(`/api/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" });
  } catch (error) {
    if (!isMissingDraftApi(error)) throw error;
    result = deleteLocalDraft(draftId);
  }
  document.querySelector("#draftList").innerHTML = DraftList(result.drafts || []);
  const form = document.querySelector("[data-draft-form]");
  if (form?.elements.draftId.value === draftId) resetDraftForm(form);
  showToast("Draft deleted");
}

function resetDraftForm(form) {
  form.reset();
  form.elements.draftId.value = "";
  currentDraftFigure = null;
  renderDraftFigurePreview();
}

function renderDraftFigurePreview() {
  const preview = document.querySelector("#draftFigurePreview");
  if (!preview) return;
  if (!currentDraftFigure?.dataUrl) {
    preview.innerHTML = `<p class="empty-state">No figure attached.</p>`;
    return;
  }
  preview.innerHTML = `
    <img src="${escapeAttribute(currentDraftFigure.dataUrl)}" alt="">
    <div>
      <strong>${escapeHtml(currentDraftFigure.name || "Attached figure")}</strong>
      <span>${formatBytes(currentDraftFigure.size)}</span>
      <button class="text-button danger" type="button" data-remove-figure>Remove figure</button>
    </div>
  `;
}

function readDraftFigure(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file"));
    if (file.size > 1200000) return reject(new Error("Use an image under about 1 MB"));
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return "Image";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isMissingDraftApi(error) {
  return String(error?.message || "").toLowerCase().includes("api route not found");
}

function localDraftsKey() {
  return `metrillix.drafts.${session.accountId || session.email || "local"}`;
}

function loadLocalDrafts() {
  try {
    const drafts = JSON.parse(localStorage.getItem(localDraftsKey()) || "[]");
    return Array.isArray(drafts) ? drafts : [];
  } catch {
    return [];
  }
}

function saveLocalDraft(draftId, payload) {
  const drafts = loadLocalDrafts();
  const now = new Date().toISOString();
  const index = drafts.findIndex((draft) => draft.id === draftId);
  const existing = index >= 0 ? drafts[index] : {};
  const draft = {
    ...existing,
    id: existing.id || `local-draft-${Date.now()}`,
    title: String(payload.title || payload.topic || payload.body || "Untitled draft").trim().slice(0, 120),
    topic: String(payload.topic || "").trim(),
    body: String(payload.body || "").trim(),
    figure: payload.figure || null,
    status: "draft",
    organizationName: linkedInState?.selectedOrganizationName || dashboardState?.linkedin?.selectedOrganizationName || "LinkedIn page",
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
  const nextDrafts = index >= 0 ? drafts.map((item) => item.id === draft.id ? draft : item) : [draft, ...drafts];
  localStorage.setItem(localDraftsKey(), JSON.stringify(nextDrafts.slice(0, 100)));
  return { draft, drafts: nextDrafts, local: true };
}

function deleteLocalDraft(draftId) {
  const drafts = loadLocalDrafts().filter((draft) => draft.id !== draftId);
  localStorage.setItem(localDraftsKey(), JSON.stringify(drafts));
  return { drafts, local: true };
}

async function publishDraft(draftId) {
  const localDraft = loadLocalDrafts().find((draft) => draft.id === draftId);
  let result;
  if (localDraft) {
    result = await api("/api/linkedin/publish", {
      method: "POST",
      body: JSON.stringify(localDraft)
    });
    result = markLocalDraftPublished(draftId, result.published);
  } else {
    result = await api(`/api/drafts/${encodeURIComponent(draftId)}/publish`, { method: "POST" });
  }
  document.querySelector("#draftList").innerHTML = DraftList(result.drafts || loadLocalDrafts());
  const link = result.published?.postUrl || result.draft?.linkedinPostUrl;
  showToast(link ? "Published to LinkedIn" : "Published to LinkedIn");
}

function markLocalDraftPublished(draftId, published = {}) {
  const drafts = loadLocalDrafts();
  const now = new Date().toISOString();
  const nextDrafts = drafts.map((draft) => draft.id === draftId ? {
    ...draft,
    status: "published",
    publishedAt: now,
    linkedinPostUrn: published.postUrn || "",
    linkedinPostUrl: published.postUrl || ""
  } : draft);
  localStorage.setItem(localDraftsKey(), JSON.stringify(nextDrafts));
  return {
    draft: nextDrafts.find((draft) => draft.id === draftId),
    drafts: nextDrafts,
    published
  };
}

async function loadPageInspiration() {
  const list = document.querySelector("#pageInspirationList");
  if (!list) return;
  list.innerHTML = `<p class="empty-state">Loading your page signals.</p>`;
  try {
    const state = dashboardState || await loadDashboardState();
    const posts = state.postRankings || state.posts || [];
    list.innerHTML = PageInspirationResults(posts);
  } catch (error) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "Unable to load page signals.")}</p>`;
  }
}

async function loadAdInspiration(form) {
  const list = document.querySelector("#adInspirationList");
  if (!list) return;
  const data = new FormData(form);
  const keyword = String(data.get("keyword") || "").trim() || "marketing automation";
  const countries = normalizeCountryInput(data.get("countries"));
  updateAdLibrarySearchLink(form, keyword, countries);
  list.innerHTML = `<p class="empty-state">Loading LinkedIn ad inspiration.</p>`;
  try {
    const result = await fetchAdInspirationResults(keyword, countries);
    const ads = result.ads || [];
    const restrictedCount = ads.filter((ad) => ad.isRestricted).length;
    list.innerHTML = AdInspirationResults(ads, restrictedCount, keyword, countries);
    list.dataset.loaded = "true";
  } catch (error) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "LinkedIn Ad Library unavailable.")}</p>`;
  }
}

async function fetchAdInspirationResults(keyword, countries) {
  const params = new URLSearchParams({ keyword, count: "24" });
  if (countries) params.set("countries", countries);
  return api(`/api/linkedin/ad-library?${params.toString()}`);
}

function AdInspirationResults(ads, restrictedCount, keyword, countries) {
  const searchUrl = linkedInAdLibrarySearchUrl(keyword, countries);
  const insights = buildAdInspirationInsights(ads, keyword);
  const sourceAds = adSourceLinks(ads);
  if (!insights.phrases.length && !insights.hashtags.length) {
    return `
      <div class="ad-library-empty">
        <strong>No phrases or hashtags found</strong>
        <p>LinkedIn returned ad records but did not include public text fields for this search, so Metrillix cannot safely summarize phrases or hashtags.</p>
        <p>${sourceAds.length ? "Use the source links below to inspect the ads in LinkedIn." : "Try a broader keyword, or leave country codes blank. Some LinkedIn Ad Library results expose only metadata through the API."}</p>
        ${restrictedCount ? `<small>${restrictedCount} restricted result${restrictedCount === 1 ? "" : "s"} skipped.</small>` : ""}
        <a class="primary-button ad-view-button" href="${escapeAttribute(searchUrl)}" target="_blank" rel="noreferrer">Open LinkedIn Ad Library</a>
      </div>
      ${sourceAds.length ? AdSourceLinks(sourceAds) : ""}
    `;
  }
  return `
    <div class="ad-insight-panel">
      <div class="ad-insight-header">
        <strong>Language signals from ${insights.sourceCount} public result${insights.sourceCount === 1 ? "" : "s"}</strong>
        <span>${restrictedCount ? `${restrictedCount} restricted skipped` : "No full ad copy shown"}</span>
      </div>
      ${InsightGroup("Key phrases", insights.phrases, "phrase")}
      ${InsightGroup("Trending hashtags", insights.hashtags, "hashtag")}
      <a class="secondary-button ad-library-search-link" href="${escapeAttribute(searchUrl)}" target="_blank" rel="noreferrer">Open LinkedIn Ad Library source search</a>
      ${sourceAds.length ? AdSourceLinks(sourceAds.slice(0, 4)) : ""}
    </div>
  `;
}

function adSourceLinks(ads) {
  return (ads || []).filter((ad) => ad.adUrl).slice(0, 8);
}

function AdSourceLinks(ads) {
  return `
    <section class="ad-source-list">
      <h3>LinkedIn source links</h3>
      ${ads.map((ad, index) => `
        <a class="ad-source-link" href="${escapeAttribute(ad.adUrl)}" target="_blank" rel="noreferrer">
          <span>${escapeHtml(ad.advertiserName && ad.advertiserName !== "LinkedIn advertiser" ? ad.advertiserName : `Ad result ${index + 1}`)}</span>
          <small>${escapeHtml([ad.adType || "Sponsored update", dateRangeLabel(ad)].filter(Boolean).join(" / "))}</small>
        </a>
      `).join("")}
    </section>
  `;
}

function PageInspirationResults(posts) {
  const insights = buildPageInspirationInsights(posts);
  if (!posts.length) {
    return `
      <div class="ad-library-empty">
        <strong>No synced posts yet</strong>
        <p>Run LinkedIn sync from the dashboard first. Then Metrillix can summarize phrases, hashtags, and themes from your own page posts.</p>
        <button class="primary-button ad-view-button" type="button" data-route="/dashboard">Go to dashboard</button>
      </div>
    `;
  }
  if (!insights.phrases.length && !insights.hashtags.length && !insights.themes.length) {
    return `
      <div class="ad-library-empty">
        <strong>No text signals found</strong>
        <p>Your synced posts did not include enough post text to extract phrases or hashtags.</p>
      </div>
    `;
  }
  return `
    <div class="ad-insight-panel">
      <div class="ad-insight-header">
        <strong>Your page signals from ${insights.sourceCount} synced post${insights.sourceCount === 1 ? "" : "s"}</strong>
        <span>Weighted by post performance where available</span>
      </div>
      ${InsightGroup("Key phrases", insights.phrases, "phrase")}
      ${InsightGroup("Trending hashtags", insights.hashtags, "hashtag")}
      ${InsightGroup("Best-performing themes", insights.themes, "phrase")}
    </div>
  `;
}

function buildPageInspirationInsights(posts) {
  const validPosts = (posts || []).filter((post) => postText(post));
  const phraseCounts = new Map();
  const hashtagCounts = new Map();
  const themeCounts = new Map();
  validPosts.forEach((post) => {
    const text = postText(post);
    const weight = postWeight(post);
    extractHashtags(text).forEach((tag) => incrementCount(hashtagCounts, tag, weight));
    extractKeyPhrases(text, "").forEach((phrase) => incrementCount(phraseCounts, phrase, weight));
  });
  validPosts
    .slice()
    .sort((a, b) => postWeight(b) - postWeight(a))
    .slice(0, 6)
    .forEach((post) => {
      extractKeyPhrases(postText(post), "").slice(0, 8).forEach((phrase) => incrementCount(themeCounts, phrase, postWeight(post)));
    });
  return {
    sourceCount: validPosts.length,
    phrases: rankedCounts(phraseCounts, 10),
    hashtags: rankedCounts(hashtagCounts, 10),
    themes: rankedCounts(themeCounts, 8)
  };
}

function postText(post) {
  return String(post?.text || post?.title || post?.commentary || post?.caption || "").trim();
}

function postWeight(post) {
  const score = Number(post?.score || 0);
  const engagements = Number(post?.engagements ?? post?.metrics?.engagements ?? 0);
  const clicks = Number(post?.clicks || 0);
  const impressions = Number(post?.impressions || 0);
  const reach = Number(post?.reach ?? post?.metrics?.reach ?? 0);
  return Math.max(1, Math.round(score || engagements * 2 + clicks * 2 + impressions / 100 + reach / 100));
}

function InsightGroup(title, items, type) {
  return `
    <section class="ad-insight-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="ad-chip-list">
        ${items.length ? items.map((item) => `<span class="ad-chip ${type === "hashtag" ? "ad-chip-hashtag" : ""}">${escapeHtml(item.label)}<small>${item.count}</small></span>`).join("") : `<p class="empty-state">No ${escapeHtml(title.toLowerCase())} found.</p>`}
      </div>
    </section>
  `;
}

function buildAdInspirationInsights(ads, keyword) {
  const visibleTexts = (ads || [])
    .filter((ad) => !ad.isRestricted)
    .map((ad) => [ad.headline, ad.description, ad.publicText].filter(Boolean).join(" "))
    .map((text) => text.trim())
    .filter(Boolean);
  const phraseCounts = new Map();
  const hashtagCounts = new Map();
  visibleTexts.forEach((text) => {
    extractHashtags(text).forEach((tag) => incrementCount(hashtagCounts, tag));
    extractKeyPhrases(text, keyword).forEach((phrase) => incrementCount(phraseCounts, phrase));
  });
  return {
    sourceCount: visibleTexts.length,
    phrases: rankedCounts(phraseCounts, 10),
    hashtags: rankedCounts(hashtagCounts, 10)
  };
}

function extractHashtags(text) {
  return Array.from(String(text || "").matchAll(/#[a-z0-9][a-z0-9_]{1,48}/gi)).map((match) => match[0].toLowerCase());
}

function extractKeyPhrases(text, keyword) {
  const stopWords = new Set("about after again against all also and are because been before being between business but can company could digital does drive each from grow growth have help here into just learn linkedin make marketing more most need only platform results should social than that their these they this through today using with your".split(" "));
  const keywordWords = new Set(String(keyword || "").toLowerCase().split(/\s+/).filter(Boolean));
  const words = String(text || "")
    .replace(/#[a-z0-9_]+/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word));
  const phrases = [];
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const slice = words.slice(index, index + size);
      if (!slice.some((word) => !keywordWords.has(word))) continue;
      phrases.push(slice.join(" "));
    }
  }
  return phrases;
}

function incrementCount(counts, label, amount = 1) {
  counts.set(label, (counts.get(label) || 0) + amount);
}

function rankedCounts(counts, limit) {
  return Array.from(counts.entries())
    .sort(([aLabel, aCount], [bLabel, bCount]) => bCount - aCount || bLabel.length - aLabel.length || aLabel.localeCompare(bLabel))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function updateAdLibrarySearchLink(form, keyword = null, countries = null) {
  const link = document.querySelector("[data-ad-library-search-link]");
  if (!link) return;
  const data = new FormData(form);
  const searchKeyword = keyword || String(data.get("keyword") || "").trim() || "marketing automation";
  const searchCountries = countries ?? normalizeCountryInput(data.get("countries"));
  link.href = linkedInAdLibrarySearchUrl(searchKeyword, searchCountries);
}

function linkedInAdLibrarySearchUrl(keyword, countries = "") {
  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (countries) params.set("countries", countries);
  const query = params.toString();
  return `https://www.linkedin.com/ad-library/search${query ? `?${query}` : ""}`;
}

function normalizeCountryInput(value) {
  return String(value || "").split(",").map((country) => country.trim().toUpperCase()).filter(Boolean).join(",");
}

function dateRangeLabel(ad) {
  const first = formatDateTime(ad.firstImpressionDate);
  const latest = formatDateTime(ad.latestImpressionDate);
  if (first && latest && first !== "Unknown" && latest !== "Unknown") return `${first} - ${latest}`;
  return "Dates unavailable";
}

function impressionRange(ad) {
  const from = ad.impressionsFrom === null || ad.impressionsFrom === undefined ? null : Number(ad.impressionsFrom).toLocaleString();
  const to = ad.impressionsTo === null || ad.impressionsTo === undefined ? null : Number(ad.impressionsTo).toLocaleString();
  if (from && to) return `${from} - ${to} impressions`;
  if (from) return `${from}+ impressions`;
  return "Impression range unavailable";
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

  document.querySelectorAll("[data-ad-inspiration-form]").forEach((form) => {
    form.addEventListener("input", () => updateAdLibrarySearchLink(form));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadAdInspiration(form);
    });
  });

  document.querySelectorAll("[data-inspiration-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      await setInspirationTab(button.dataset.inspirationTab);
    });
  });

  document.querySelectorAll("[data-draft-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveDraft(form);
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-draft-figure]").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        currentDraftFigure = await readDraftFigure(input.files?.[0]);
        renderDraftFigurePreview();
      } catch (error) {
        input.value = "";
        showToast(error.message);
      }
    });
  });
}

async function setInspirationTab(tab) {
  document.querySelectorAll("[data-inspiration-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.inspirationTab === tab);
  });
  document.querySelectorAll("[data-inspiration-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.inspirationPanel === tab);
  });
  if (tab === "page") await loadPageInspiration();
  if (tab === "market") {
    const form = document.querySelector("[data-ad-inspiration-form]");
    const list = document.querySelector("#adInspirationList");
    if (form && list && !list.dataset.loaded) {
      await loadAdInspiration(form);
      list.dataset.loaded = "true";
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  }[char]));
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
      if (result.state) {
        dashboardState = result.state;
        linkedInState = { ...(linkedInState || {}), ...(result.state.linkedin || {}) };
        await hydrateDashboard(result.state);
      } else {
        await hydrateDashboard();
      }
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

  if (event.target.closest("[data-new-draft]")) {
    const form = document.querySelector("[data-draft-form]");
    if (form) resetDraftForm(form);
    return;
  }

  if (event.target.closest("[data-remove-figure]")) {
    currentDraftFigure = null;
    const figureInput = document.querySelector("[data-draft-figure]");
    if (figureInput) figureInput.value = "";
    renderDraftFigurePreview();
    return;
  }

  const editDraftTarget = event.target.closest("[data-edit-draft]");
  if (editDraftTarget) {
    try {
      await editDraft(editDraftTarget.dataset.editDraft);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const deleteDraftTarget = event.target.closest("[data-delete-draft]");
  if (deleteDraftTarget) {
    try {
      await deleteDraft(deleteDraftTarget.dataset.deleteDraft);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const publishDraftTarget = event.target.closest("[data-publish-draft]");
  if (publishDraftTarget) {
    try {
      publishDraftTarget.disabled = true;
      publishDraftTarget.textContent = "Publishing";
      await publishDraft(publishDraftTarget.dataset.publishDraft);
    } catch (error) {
      showToast(error.message);
      publishDraftTarget.disabled = false;
      publishDraftTarget.textContent = "Publish";
    }
    return;
  }

  const organizationTarget = event.target.closest("[data-organization]");
  if (event.target.closest("[data-select-organization]") && organizationTarget) {
    try {
      const nameInput = organizationTarget.querySelector("[data-organization-name]");
      const result = await api("/api/linkedin/select-organization", {
        method: "POST",
        body: JSON.stringify({
          organizationUrn: organizationTarget.dataset.organization,
          organizationName: nameInput?.value || ""
        })
      });
      linkedInState = result;
      navigate("/dashboard");
    } catch (error) {
      showToast(error.message);
    }
  }

  if (event.target.closest("[data-edit-organization-name]") && organizationTarget) {
    organizationTarget.classList.add("editing");
    organizationTarget.querySelector("[data-organization-name]")?.focus();
    return;
  }

  if (event.target.closest("[data-save-organization-name]") && organizationTarget) {
    try {
      const nameInput = organizationTarget.querySelector("[data-organization-name]");
      const result = await api("/api/linkedin/organization-name", {
        method: "POST",
        body: JSON.stringify({
          organizationUrn: organizationTarget.dataset.organization,
          organizationName: nameInput?.value || ""
        })
      });
      linkedInState = result;
      showToast("Page name updated");
      await hydrateOnboarding();
    } catch (error) {
      showToast(error.message);
    }
  }
}

function organizationUrn(organization) {
  if (!organization) return "";
  if (typeof organization === "string") return organization;
  return organization.urn || organization.organizationUrn || organization.organization || organization.id || "";
}

function organizationName(organization) {
  if (!organization) return "LinkedIn page";
  if (typeof organization === "string") {
    const id = organization.split(":").pop();
    return id ? `LinkedIn page ${id}` : "LinkedIn page";
  }
  return organization.name || organization.label || organization.displayName || organizationName(organizationUrn(organization));
}

async function render() {
  const path = window.location.pathname;
  const route = routes[path] ? path : "/";
  const isPrivate = route.startsWith("/dashboard") || route === "/create-post";

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
    if (route === "/create-post") await hydrateCreatePost();
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
