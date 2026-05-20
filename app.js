const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const apiBaseUrl = window.METRICFLOW_API_BASE_URL || "";
const appUrl = window.METRICFLOW_CLOUDFLARE_APP_URL || window.location.origin;
const sessionKey = "metricflow.session";

let session = readSession();
let dashboardState = null;
let linkedInState = null;
let linkedInOAuthStatus = null;

const routes = {
  "/": WelcomePage,
  "/signup": SignupPage,
  "/login": LoginPage,
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
  const samePath = window.location.pathname === path;
  window.history.pushState({}, "", path);
  if (samePath) window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function captureOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  const linkedInUserId = params.get("linkedinUserId");
  if (linkedInUserId) saveSession({ linkedInUserId });
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
  const linkedInUserId = session.linkedInUserId;
  if (linkedInUserId) headers["x-metricflow-user-id"] = linkedInUserId;
  if (session.token) headers.authorization = `Bearer ${session.token}`;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers
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
    accountId: result.userId || result.id || session.accountId || "",
    linkedInUserId: result.linkedinUserId || ""
  });
  navigate("/dashboard/onboarding");
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
      <button class="nav-link" data-route="/login">Log In</button>
      <button class="nav-signup" data-route="/signup">Sign Up</button>
    `;

  return `
    <header class="top-nav">
      <button class="brand-link" data-route="/" aria-label="MetricFlow home">
        <span class="brand-dot"></span>
        <span>MetricFlow</span>
      </button>
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
        <p>Track your LinkedIn performance with clean, actionable insights.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get Started</button>
          <button class="text-button" data-route="/login">Log In</button>
        </div>
      </section>

      <section class="front-section" id="features">
        <div class="section-intro">
          <p class="eyebrow">Features</p>
          <h2>Everything you need to understand LinkedIn performance.</h2>
        </div>
        <div class="feature-grid">
          <article class="feature-card">
            <span class="feature-placeholder">01</span>
            <h3>Post Performance Insights</h3>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae lorem at arcu facilisis pretium.</p>
          </article>
          <article class="feature-card">
            <span class="feature-placeholder">02</span>
            <h3>Audience Growth Tracking</h3>
            <p>Praesent commodo augue sed risus posuere, non pulvinar mi laoreet. Donec luctus sem nec justo.</p>
          </article>
          <article class="feature-card">
            <span class="feature-placeholder">03</span>
            <h3>Engagement Analytics</h3>
            <p>Suspendisse sit amet velit non neque consequat blandit. Aliquam erat volutpat sed tempor.</p>
          </article>
        </div>
      </section>

      <section class="front-section about-section" id="about">
        <p class="eyebrow">About Us</p>
        <h2>Built to make LinkedIn reporting simple.</h2>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Metrillix helps teams turn LinkedIn activity into clear reporting, practical insights, and better content decisions without unnecessary complexity.</p>
      </section>

      <section class="front-section policy-section" id="privacy">
        <p class="eyebrow">Privacy Policy</p>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis et lectus sit amet arcu consequat tincidunt.</p>
      </section>

      <section class="front-section policy-section" id="terms">
        <p class="eyebrow">Terms</p>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus non mauris sed turpis congue posuere.</p>
      </section>

      <section class="front-cta">
        <h2>Start analyzing your LinkedIn today</h2>
        <button class="primary-button" data-route="/signup">Create Account</button>
      </section>
    </main>
    <footer class="front-footer">
      <nav>
        <a href="#about">About Us</a>
        <a href="#privacy">Privacy Policy</a>
        <a href="#terms">Terms of Service</a>
        <a href="mailto:hello@metrillix.com">Contact</a>
      </nav>
      <p>© 2026 Metrillix. All rights reserved.</p>
    </footer>
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
        <p class="muted">New to MetricFlow? <button class="inline-link" data-route="/signup">Create an account</button></p>
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
  return `
    <p class="eyebrow">Step 1</p>
    <h1>Connect LinkedIn</h1>
    <p class="muted">${helper}</p>
    <a class="primary-button link-button" href="${apiBaseUrl}/api/connectors/linkedin/connect" data-connect-linkedin>Connect LinkedIn</a>
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
        <button class="primary-button" data-sync-linkedin>Sync LinkedIn</button>
      </section>
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

function wirePageEvents() {
  app.onclick = handleAppClick;

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

}

async function handleAppClick(event) {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    navigate(routeTarget.dataset.route);
    return;
  }

  if (event.target.closest("[data-logout]")) {
    clearSession();
    navigate("/");
    return;
  }

  if (event.target.closest("[data-connect-linkedin]")) {
    event.preventDefault();
    // LinkedIn client id/secret never live in the frontend. The Worker owns
    // OAuth configuration and returns a LinkedIn authorization redirect.
    window.location.href = `${apiBaseUrl}/api/connectors/linkedin/connect`;
    return;
  }

  if (event.target.closest("[data-sync-linkedin]")) {
    try {
      await api("/api/connectors/linkedin/sync", { method: "POST" });
      await hydrateDashboard();
      showToast("LinkedIn synced");
    } catch (error) {
      showToast(error.message);
    }
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

  if (isPrivate && !session.email && !session.accountId && !session.linkedInUserId) {
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
}

window.addEventListener("popstate", render);
captureOAuthReturn();
render();
