const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const apiBaseUrl = window.METRICFLOW_API_BASE_URL || "";
const appUrl = window.METRICFLOW_CLOUDFLARE_APP_URL || window.location.origin;
const sessionKey = "metricflow.session";
const linkedInUserStorageKey = "metricflow.linkedinUserId";

let session = readSession();
let dashboardState = null;
let linkedInState = null;

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
  if (session.userId) localStorage.setItem(linkedInUserStorageKey, session.userId);
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
  window.history.pushState({}, "", path);
  render();
}

function captureOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  const linkedInUserId = params.get("linkedinUserId");
  if (linkedInUserId) saveSession({ userId: linkedInUserId });
  if (params.get("connector") === "connected") {
    window.history.replaceState({}, "", "/dashboard/onboarding");
    showToast("LinkedIn connected");
  }
}

async function api(path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  const userId = session.userId || localStorage.getItem(linkedInUserStorageKey);
  if (userId) headers["x-metricflow-user-id"] = userId;
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
    userId: result.userId || result.id || result.linkedinUserId || session.userId || ""
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

async function loadDashboardState() {
  dashboardState = await api("/api/state");
  return dashboardState;
}

function TopNav({ right = "login" } = {}) {
  const links = right === "dashboard"
    ? `<button class="nav-link" data-route="/dashboard">Dashboard</button><button class="nav-link" data-logout>Log out</button>`
    : `<button class="nav-link" data-route="/login">Log in</button>`;

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
    <main class="page-shell hero-shell">
      <section class="hero">
        <p class="eyebrow">LinkedIn analytics for modern teams</p>
        <h1>Turn LinkedIn performance into clear decisions.</h1>
        <p class="hero-copy">Connect your LinkedIn account, choose the organization you manage, and keep your analytics workspace focused on the right tenant.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get Started</button>
          <button class="text-button" data-route="/login">Log in</button>
        </div>
      </section>
    </main>
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
  return `
    <p class="eyebrow">Step 1</p>
    <h1>Connect LinkedIn</h1>
    <p class="muted">Connect the LinkedIn account that administers the organizations you want to analyze.</p>
    <button class="primary-button" data-connect-linkedin>Connect LinkedIn</button>
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
  container.innerHTML = DashboardReadyStep();
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
  document.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.route));
  });

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

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    clearSession();
    navigate("/");
  });

  document.querySelector("[data-connect-linkedin]")?.addEventListener("click", () => {
    window.location.href = `${apiBaseUrl}/api/connectors/linkedin/connect`;
  });

  document.querySelectorAll("[data-organization]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api("/api/linkedin/select-organization", {
          method: "POST",
          body: JSON.stringify({ organizationUrn: button.dataset.organization })
        });
        linkedInState = result;
        navigate("/dashboard");
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelector("[data-sync-linkedin]")?.addEventListener("click", async () => {
    try {
      await api("/api/connectors/linkedin/sync", { method: "POST" });
      await hydrateDashboard();
      showToast("LinkedIn synced");
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function render() {
  const path = window.location.pathname;
  const route = routes[path] ? path : "/";
  const isPrivate = route.startsWith("/dashboard");

  if (isPrivate && !session.email && !session.userId && !localStorage.getItem(linkedInUserStorageKey)) {
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
