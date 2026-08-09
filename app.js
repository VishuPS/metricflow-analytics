const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const apiBaseUrl = window.METRICFLOW_API_BASE_URL || "";
const appUrl = window.METRICFLOW_CLOUDFLARE_APP_URL || window.location.origin;
const sessionKey = "metricflow.session";
const cookieConsentKey = "metrillix.cookieConsent";
const previousPathKey = "metrillix.previousPath";
const themePreferenceKey = "metrillix.theme";

let session = readSession();
let dashboardState = null;
let linkedInState = null;
let linkedInOAuthStatus = null;
let currentDraftFigure = null;

const routes = {
  "/": WelcomePage,
  "/features": FeaturesPage,
  "/pricing": PricingPage,
  "/about": AboutPage,
  "/contact": ContactPage,
  "/signup": SignupPage,
  "/login": LoginPage,
  "/forgot-password": ForgotPasswordPage,
  "/reset-password": ResetPasswordPage,
  "/cookie-policy": CookiePolicyPage,
  "/admin": AdminPage,
  "/billing/success": BillingSuccessPage,
  "/billing/cancel": BillingCancelPage,
  "/dashboard/onboarding": OnboardingPage,
  "/dashboard/analytics": AnalyticsDashboardPage,
  "/share/report": SharedReportPage,
  "/create-post": CreatePostPage,
  "/dashboard": Dashboard
};

function readSession() {
  return JSON.parse(localStorage.getItem(sessionKey) || "null") || {};
}

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function currentTheme() {
  return localStorage.getItem(themePreferenceKey) || systemTheme();
}

function applyTheme(theme = currentTheme()) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.textContent = nextTheme === "dark" ? "Light mode" : "Dark mode";
    button.setAttribute("aria-label", `Switch to ${nextTheme === "dark" ? "light" : "dark"} mode`);
    button.setAttribute("aria-pressed", String(nextTheme === "dark"));
  });
}

function toggleTheme() {
  const nextTheme = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(themePreferenceKey, nextTheme);
  applyTheme(nextTheme);
}

function saveSession(nextSession) {
  session = { ...session, ...nextSession };
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

function clearSession() {
  session = {};
  localStorage.removeItem(sessionKey);
}

function hasActiveSession() {
  return Boolean(session.email || session.accountId || session.token);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function showError(error, fallback = "Something went wrong. Please try again.") {
  showToast(userMessage(error, fallback));
}

function navigate(path, { trackPrevious = true } = {}) {
  const [targetPath, hash = ""] = path.split("#");
  const nextPath = targetPath || "/";
  if (trackPrevious && window.location.pathname !== path) {
    sessionStorage.setItem(previousPathKey, window.location.pathname);
  }
  const shouldScrollTop = !hash && (nextPath === "/" || window.location.pathname === nextPath);
  window.history.pushState({}, "", hash ? `${nextPath}#${hash}` : nextPath);
  render();
  if (hash) {
    window.requestAnimationFrame(() => scrollToSection(hash));
    return;
  }
  if (shouldScrollTop) {
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
}

function setPageMeta(route) {
  const meta = {
    "/": {
      title: "Metrillix | LinkedIn Intelligence, Simplified",
      description: "Metrillix turns LinkedIn performance into executive-ready summaries, recommendations, reports, and content planning.",
      index: true
    },
    "/about": {
      title: "About Metrillix | Calm LinkedIn Intelligence",
      description: "Learn why Metrillix is building LinkedIn intelligence for clearer business decisions.",
      index: true
    },
    "/features": {
      title: "Features | Metrillix",
      description: "Explore the Metrillix intelligence workflow: AI summaries, actionable recommendations, executive reports, and content planning.",
      index: true
    },
    "/pricing": {
      title: "Pricing | Metrillix Plans",
      description: "Compare Metrillix Starter, Growth, and Enterprise plans for LinkedIn Company Page analytics, reports, and content planning.",
      index: true
    },
    "/contact": {
      title: "Contact | Metrillix",
      description: "Contact Metrillix for product questions, support, partnerships, and early customer conversations.",
      index: true
    },
    "/cookie-policy": {
      title: "Cookie Policy | Metrillix",
      description: "How Metrillix uses essential cookies for secure login, dashboard sessions, and account preferences.",
      index: true
    },
    "/admin": {
      title: "Admin | Metrillix",
      description: "Metrillix account administration."
    },
    "/billing/success": {
      title: "Billing Started | Metrillix",
      description: "Your Metrillix checkout completed."
    },
    "/billing/cancel": {
      title: "Billing Canceled | Metrillix",
      description: "Return to Metrillix pricing."
    },
    "/login": {
      title: "Log In | Metrillix",
      description: "Log in to your Metrillix analytics workspace."
    },
    "/signup": {
      title: "Sign Up | Metrillix",
      description: "Create a Metrillix account and start exploring LinkedIn Company Page analytics."
    },
    "/forgot-password": {
      title: "Reset Password | Metrillix",
      description: "Request a secure password reset link for your Metrillix account."
    },
    "/reset-password": {
      title: "Set New Password | Metrillix",
      description: "Set a new password for your Metrillix analytics workspace."
    }
  }[route] || {
    title: "Metrillix",
    description: "LinkedIn Company Page analytics for clearer content decisions."
  };
  document.title = meta.title;
  const canonical = `${appUrl}${route === "/" ? "/" : route}`;
  setMetaTag("name", "description", meta.description);
  setMetaTag("name", "robots", meta.index ? "index,follow" : "noindex,nofollow");
  setMetaTag("property", "og:title", meta.title);
  setMetaTag("property", "og:description", meta.description);
  setMetaTag("property", "og:url", canonical);
  setMetaTag("property", "og:type", "website");
  setMetaTag("name", "twitter:title", meta.title);
  setMetaTag("name", "twitter:description", meta.description);
  setLinkTag("canonical", canonical);
}

function setMetaTag(attribute, key, content) {
  let element = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setLinkTag(rel, href) {
  let element = document.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

function navigateBack(fallback = "/") {
  const previousPath = sessionStorage.getItem(previousPathKey);
  if (previousPath && previousPath !== window.location.pathname && routes[previousPath]) {
    sessionStorage.removeItem(previousPathKey);
    navigate(previousPath, { trackPrevious: false });
    return;
  }
  navigate(fallback, { trackPrevious: false });
}

function captureOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("connector") === "connected") {
    window.history.replaceState({}, "", "/dashboard/onboarding");
    showToast("LinkedIn connected");
  }
  if (params.get("connector") === "error") {
    showToast(userMessage(params.get("message"), "LinkedIn connection failed. Please try connecting again."));
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
    const error = new Error(message || "Request failed");
    error.status = response.status;
    throw error;
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
    isAdmin: Boolean(result.isAdmin)
  });
  navigate("/dashboard/onboarding");
}

async function startBillingCheckout(plan = "growth") {
  if (!hasActiveSession()) {
    sessionStorage.setItem(previousPathKey, "/pricing");
    showToast("Create an account first, then choose Growth.");
    navigate("/signup");
    return;
  }
  const paymentLinks = {
    growth: window.STRIPE_PAYMENT_LINK_GROWTH,
    enterprise: window.STRIPE_PAYMENT_LINK_ENTERPRISE
  };
  const paymentLink = paymentLinks[plan] || "";
  if (paymentLink) {
    window.location.href = stripePaymentLinkUrl(paymentLink, plan);
    return;
  }
  if (plan === "enterprise" && !window.STRIPE_PAYMENT_LINK_ENTERPRISE) {
    showToast("Enterprise checkout is almost ready. Contact us for access.");
    navigate("/contact");
    return;
  }
  const result = await api("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan })
  });
  if (!result.url) throw new Error("Stripe checkout did not return a payment link.");
  window.location.href = result.url;
}

function stripePaymentLinkUrl(link, plan = "growth") {
  const url = new URL(link);
  if (session.accountId) url.searchParams.set("client_reference_id", `${session.accountId}:${plan}`);
  if (session.email) url.searchParams.set("locked_prefilled_email", session.email);
  url.searchParams.set("utm_source", "metrillix");
  url.searchParams.set("utm_medium", "app_checkout");
  url.searchParams.set("utm_campaign", `${plan}_subscription`);
  return url.toString();
}

async function openBillingPortal() {
  const result = await api("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify({})
  });
  if (!result.url) throw new Error("Stripe billing portal did not return a link.");
  window.location.href = result.url;
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
  const themeButton = `<button class="theme-toggle" type="button" data-theme-toggle aria-pressed="${currentTheme() === "dark"}">${currentTheme() === "dark" ? "Light mode" : "Dark mode"}</button>`;
  const adminLink = session.isAdmin ? `<button class="nav-link" data-route="/admin">Admin</button>` : "";
  const links = right === "dashboard"
    ? `<button class="nav-link" data-route="/dashboard">Dashboard</button>${adminLink}${themeButton}<button class="nav-link" data-logout>Log out</button>`
    : `
      <button class="nav-link" data-route="/">Home</button>
      <button class="nav-link" data-route="/features">Features</button>
      <button class="nav-link" data-route="/pricing">Pricing</button>
      <button class="nav-link" data-route="/about">About</button>
      <button class="nav-link" data-route="/contact">Contact</button>
      ${adminLink}
      ${themeButton}
      <button class="nav-link" data-route="/login">Log In</button>
      <button class="nav-signup" data-route="/signup">Get Started</button>
    `;

  return `
    <header class="top-nav">
      <a class="brand-link" href="/" data-route="/" data-brand-home aria-label="Metrillix home">
        <img class="brand-logo" src="/assets/metric-flow-logo-small.png?v=20260618-light-logo" alt="Metrillix">
      </a>
      <nav>${links}</nav>
    </header>
  `;
}

function BackButton({ fallback = "/" } = {}) {
  return `<div class="page-back-row"><button class="back-button" type="button" data-back data-back-fallback="${escapeAttribute(fallback)}">Back</button></div>`;
}

function SectionHeader({ eyebrow = "", title, text = "" }) {
  return `
    <div class="section-header reveal">
      ${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
      <h2>${escapeHtml(title)}</h2>
      ${text ? `<p>${escapeHtml(text)}</p>` : ""}
    </div>
  `;
}

function HeroSignal({ value, label }) {
  return `
    <article class="hero-signal">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function FeatureCard({ title, text, label = "" }) {
  return `
    <article class="feature-card reveal">
      ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function TrustCard({ title, text }) {
  return `
    <article class="trust-card reveal">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function MetricCard({ label, value, detail = "" }) {
  return `
    <article class="mock-metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      <i aria-hidden="true"></i>
    </article>
  `;
}

function FAQItem({ question, answer }) {
  return `
    <details class="faq-item reveal">
      <summary>${escapeHtml(question)}</summary>
      <p>${escapeHtml(answer)}</p>
    </details>
  `;
}

function PricingCard({ label, name, description, price, features, featured = false, buttonText, note = "", billingPlan = "" }) {
  const actionAttribute = billingPlan ? `data-billing-checkout="${escapeAttribute(billingPlan)}"` : `data-route="/signup"`;
  return `
    <article class="pricing-card ${featured ? "featured" : ""} reveal">
      <div>
        <span class="plan-label">${escapeHtml(label)}</span>
        <h3>${escapeHtml(name)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="plan-price"><strong>${escapeHtml(price)}</strong><span>/month</span></div>
      ${note ? `<p class="plan-note">${escapeHtml(note)}</p>` : ""}
      <ul>
        ${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
      </ul>
      <button class="${featured ? "primary-button" : "secondary-button"} full" ${actionAttribute}>${escapeHtml(buttonText)}</button>
    </article>
  `;
}

function ComparisonTable({ rows }) {
  return `
    <div class="comparison-table reveal" role="table" aria-label="Plan comparison">
      <div class="comparison-row comparison-head" role="row">
        <span role="columnheader">Feature</span>
        <span role="columnheader">Free</span>
        <span role="columnheader">Growth</span>
        <span role="columnheader">Enterprise</span>
      </div>
      ${rows.map((row) => `
        <div class="comparison-row" role="row">
          <span role="cell">${escapeHtml(row.feature)}</span>
          <span role="cell">${escapeHtml(row.free)}</span>
          <span role="cell">${escapeHtml(row.growth)}</span>
          <span role="cell">${escapeHtml(row.enterprise || "")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function WorkflowStepper({ steps }) {
  return `
    <ol class="workflow-stepper reveal" aria-label="Metrillix workflow steps">
      ${steps.map((step, index) => `
        <li class="workflow-step" style="--step-index: ${index};">
          <div class="workflow-step-marker" aria-hidden="true">${escapeHtml(step.number)}</div>
          <article class="workflow-step-panel">
            <span>${escapeHtml(step.number)}</span>
            <h3>${escapeHtml(step.title)}</h3>
            <p>${escapeHtml(step.text)}</p>
          </article>
        </li>
      `).join("")}
    </ol>
  `;
}

function CTASection({ title, text, primary = "Get Started", secondary = "Contact" }) {
  return `
    <section class="simple-section cta-section reveal">
      <div class="cta-copy">
        <p class="eyebrow">Start now</p>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
      </div>
      <div class="hero-actions">
        <button class="primary-button" data-route="/signup">${escapeHtml(primary)}</button>
        <a class="secondary-button" href="mailto:hello@metrillix.com">${escapeHtml(secondary)}</a>
      </div>
    </section>
  `;
}

function DashboardPreview() {
  return `
    <figure class="dashboard-preview studio-preview reveal" aria-label="Metrillix product preview">
      <div class="studio-toolbar">
        <div>
          <span>Metrillix Studio</span>
          <strong>Weekly LinkedIn review</strong>
        </div>
        <small>Ready to brief</small>
      </div>
      <div class="studio-grid">
        <article class="studio-brief">
          <span>Strategy brief</span>
          <h3>Your strongest signal is founder-led practical content.</h3>
          <p>Double down on short posts that connect product lessons to proof. Publish the next one Tuesday morning.</p>
          <div class="brief-actions" aria-hidden="true">
            <i>Use this angle</i>
            <i>Prepare draft</i>
          </div>
        </article>
        <article class="studio-metric">
          <span>Page momentum</span>
          <strong>+18.4%</strong>
          <small>Follower growth over 30 days</small>
          <svg viewBox="0 0 180 54" role="img" aria-label="Small upward follower growth trend">
            <path d="M4 42 C34 34 42 38 62 24 S102 14 122 24 148 32 176 10"></path>
          </svg>
        </article>
        <article class="studio-report">
          <span>Report card</span>
          <h3>Board-ready summary</h3>
          <div class="report-lines" aria-hidden="true">
            <i></i><i></i><i></i><i></i>
          </div>
          <p>Reach, engagement, top post, timing, and next action condensed into one shareable brief.</p>
        </article>
        <article class="studio-queue">
          <span>Content workspace</span>
          <div class="queue-item">
            <strong>Founder POV</strong>
            <small>Recommended next</small>
          </div>
          <div class="queue-item">
            <strong>Customer proof</strong>
            <small>Needs stronger hook</small>
          </div>
          <div class="queue-item">
            <strong>Product lesson</strong>
            <small>Schedule after review</small>
          </div>
        </article>
        <article class="studio-insight">
          <span>AI note</span>
          <strong>Keep the insight, remove the jargon.</strong>
          <p>Draft feedback focuses on clarity, proof, and timing instead of more charts.</p>
        </article>
      </div>
    </figure>
  `;
}

function PricingSection() {
  return `
    <section class="simple-section pricing-section" id="pricing">
      ${SectionHeader({
        eyebrow: "Pricing",
        title: "Start free. Upgrade when LinkedIn becomes a growth channel.",
        text: "Every paid subscription starts with 1 month free. No long-term contract, no setup fee."
      })}
      <div class="pricing-grid core-pricing-grid">
        ${PricingCard({
          label: "Free",
          name: "Starter",
          description: "Perfect for exploring Metrillix with one LinkedIn Company Page.",
          price: "$0",
          features: ["One LinkedIn Company Page", "Basic page overview", "Recent post analytics", "Manual synchronization", "One month free"],
          buttonText: "Start free"
        })}
        ${PricingCard({
          label: "1 month free",
          name: "Growth",
          description: "Designed for businesses publishing consistently.",
          price: "$9.99",
          features: ["Full historical analytics", "Trend analysis", "Performance insights", "Content Workspace", "Priority feature access"],
          featured: true,
          buttonText: "Try Growth free",
          billingPlan: "growth"
        })}
        ${PricingCard({
          label: "5 pages",
          name: "Enterprise",
          description: "For teams managing multiple LinkedIn Company Pages with stronger reporting needs.",
          price: "Custom",
          features: ["Up to 5 Company Pages", "Cross-page reporting", "Executive report briefs", "Priority support", "Expanded AI planning features"],
          buttonText: "Choose Enterprise",
          billingPlan: "enterprise"
        })}
      </div>
    </section>
  `;
}

function ComingSoonSection() {
  return `
    <section class="simple-section ai-coming-soon-section" id="ai-coming-soon">
      <div class="ai-coming-soon reveal">
        <div class="ai-coming-soon-copy">
          <p class="eyebrow">Premium Intelligence</p>
          <h2>The next generation of Metrillix turns reporting into strategy.</h2>
          <p>Upcoming premium capabilities will surface AI recommendations, publishing quality checks, audience behavior signals, forecasting, and concise strategy briefs for every review cycle.</p>
          <div class="ai-coming-soon-actions">
            <button class="primary-button" data-route="/signup">Join the waitlist</button>
            <a class="secondary-button" href="mailto:hello@metrillix.com?subject=Metrillix%20AI%20updates">Get updates</a>
          </div>
        </div>
        <div class="ai-coming-soon-panel" aria-label="Upcoming AI features">
          <span>Intelligence layer</span>
          <ul>
            <li>Best next post angle</li>
            <li>Draft quality scoring</li>
            <li>Reach and engagement forecasts</li>
            <li>Board-ready strategy summaries</li>
          </ul>
        </div>
      </div>
    </section>
  `;
}

function PublicFooter() {
  return `
    <footer class="simple-footer">
      <nav>
        <a href="/#privacy" data-route="/#privacy">Privacy Policy</a>
        <a href="/#terms" data-route="/#terms">Terms of Service</a>
        <button class="footer-link" data-route="/cookie-policy">Cookie Policy</button>
      </nav>
    </footer>
  `;
}

function WelcomePage() {
  return `
    ${TopNav()}
    <main class="simple-home">
      <section class="simple-hero home-hero" id="home">
        <div class="hero-copy reveal">
          <p class="eyebrow">LinkedIn intelligence studio</p>
          <h1>Turn LinkedIn performance into a clear next move.</h1>
          <p>Metrillix gives founders and marketing teams a calm workspace for page health, winning content, shareable reports, and practical recommendations without drowning the screen in charts.</p>
          <div class="hero-actions">
            <button class="primary-button" data-route="/signup">Start free</button>
            <a class="secondary-button" href="#dashboard-preview">View the studio</a>
          </div>
          <div class="hero-proof" aria-label="Metrillix platform highlights">
            ${HeroSignal({ value: "Briefs", label: "Shareable weekly performance summaries" })}
            ${HeroSignal({ value: "Signals", label: "Top posts, timing, and page momentum" })}
            ${HeroSignal({ value: "Drafts", label: "Plan content beside the insight" })}
          </div>
        </div>
        ${DashboardPreview()}
      </section>

      <section class="simple-section split-section" id="why-metrillix">
        ${SectionHeader({
          eyebrow: "Why Metrillix",
          title: "A calmer loop from review to action.",
          text: "Metrillix keeps the useful signals visible, turns the rest into plain-language summaries, and helps you plan what to publish next."
        })}
        <div class="feature-grid three-card-grid">
          ${FeatureCard({ label: "01", title: "Summarize the week", text: "See the story behind performance without exporting data or comparing screens by hand." })}
          ${FeatureCard({ label: "02", title: "Find the winning angle", text: "Understand which topics, hooks, and proof points are worth repeating." })}
          ${FeatureCard({ label: "03", title: "Plan the next post", text: "Move from insight to draft while the signal is still fresh." })}
        </div>
      </section>

      <section class="simple-section wide-section" id="features">
        ${SectionHeader({
          eyebrow: "Product Studio",
          title: "Built for decisions, not dashboard fatigue.",
          text: "The interface prioritizes readable summaries, focused signals, and content workflow artifacts over dense chart collections."
        })}
        <div class="feature-grid">
          ${FeatureCard({ title: "Weekly performance brief", text: "Condense page movement, strongest content, and recommended action into a report your team can read quickly." })}
          ${FeatureCard({ title: "Focused signal cards", text: "Show only the metrics that explain what changed and what to do about it." })}
          ${FeatureCard({ title: "Content pattern finder", text: "Surface the post angles and proof points your audience responds to." })}
          ${FeatureCard({ title: "Publishing guidance", text: "Use best-window signals and content history to plan with more intent." })}
          ${FeatureCard({ title: "Workspace for drafts", text: "Keep upcoming post ideas connected to the performance evidence behind them." })}
          ${FeatureCard({ title: "AI recommendations", text: "Upcoming intelligence turns the review into draft feedback, next actions, and concise strategy notes.", label: "AI Layer" })}
        </div>
      </section>

      <section class="simple-section dashboard-preview-section" id="dashboard-preview">
        ${SectionHeader({
          eyebrow: "See Your Data Differently",
          title: "A studio view with fewer charts and stronger artifacts.",
          text: "The preview combines a strategy brief, one trend cue, a report card, and a content queue so the product feels useful before it feels busy."
        })}
        ${DashboardPreview()}
      </section>

      <section class="simple-section split-section" id="simplicity">
        ${SectionHeader({
          eyebrow: "Built Around Simplicity",
          title: "Analytics software should reduce complexity.",
          text: "Metrillix focuses on the metrics that matter most through a clean interface designed for everyday use."
        })}
        <div class="trust-grid">
          ${TrustCard({ title: "Minutes, not hours", text: "Review page health quickly without exporting reports into spreadsheets." })}
          ${TrustCard({ title: "One page or many", text: "Built for professionals managing a single Company Page today and more complex workflows tomorrow." })}
          ${TrustCard({ title: "Clear next steps", text: "Turn performance history into practical planning signals." })}
        </div>
      </section>

      <section class="simple-section" id="privacy">
        ${SectionHeader({
          eyebrow: "Secure by Design",
          title: "Your privacy is fundamental.",
          text: "Metrillix connects securely using LinkedIn OAuth and only accesses the Company Pages you explicitly authorize. We never access personal messages, private conversations, or personal profile analytics."
        })}
      </section>

      ${PricingSection()}
      ${ComingSoonSection()}

      <section class="simple-section" id="terms">
        <h2>Terms of Service</h2>
        <p>By using Metrillix, you agree to connect only LinkedIn company pages you are authorized to manage and to use the platform in line with LinkedIn's API terms. Drafts and page analytics remain inside your account unless you choose to publish a draft to LinkedIn.</p>
      </section>

      ${CTASection({
        title: "Start understanding your LinkedIn performance with clarity.",
        text: "Connect your Company Page in minutes and begin exploring analytics designed to support better content decisions."
      })}
    </main>
    ${PublicFooter()}
  `;
}

function FeaturesPage() {
  return `
    ${TopNav()}
    <main class="simple-home product-page">
      <section class="simple-hero product-hero">
        <p class="eyebrow">Features</p>
        <h1>Everything You Need to Understand Your LinkedIn Performance</h1>
        <p>Powerful analytics should not be difficult to understand. Metrillix transforms your LinkedIn Company Page data into intuitive dashboards that reveal meaningful trends, highlight successful content, and help you make better publishing decisions.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get Started</button>
          <button class="secondary-button" data-route="/pricing">View Pricing</button>
        </div>
      </section>

      <section class="simple-section wide-section">
        ${SectionHeader({
          eyebrow: "Platform Overview",
          title: "A guided workspace for LinkedIn performance.",
          text: "Metrillix brings metrics, trends, top posts, publishing patterns, and planning tools together so teams can move from reporting to decisions."
        })}
        <div class="feature-grid three-card-grid">
          ${FeatureCard({ label: "Dashboard", title: "Analytics Dashboard", text: "Monitor impressions, reach, engagement, follower growth, post activity, and audience behavior without switching reports." })}
          ${FeatureCard({ label: "Trends", title: "Performance Trends", text: "Interactive chart-style views help identify growth patterns, seasonal changes, and long-term performance." })}
          ${FeatureCard({ label: "Content", title: "Content Performance", text: "Discover which posts generated the strongest engagement, reached larger audiences, or created meaningful interactions." })}
        </div>
      </section>

      <section class="simple-section dashboard-preview-section">
        ${SectionHeader({
          eyebrow: "Analytics Dashboard",
          title: "See the whole performance picture in one place.",
          text: "Use KPI cards, trend charts, top-post summaries, timing signals, workspace previews, and upcoming AI insights to understand what is working."
        })}
        ${DashboardPreview()}
      </section>

      <section class="simple-section wide-section">
        ${SectionHeader({
          eyebrow: "Product Tour",
          title: "Built for every stage of performance review.",
          text: "From historical analytics to content planning, each area is designed to make LinkedIn performance easier to interpret."
        })}
        <div class="feature-tour-grid">
          ${TrustCard({ title: "Historical Analytics", text: "Explore performance through visual trend analysis and compare publishing periods to understand how your strategy evolves." })}
          ${TrustCard({ title: "Content Workspace", text: "Prepare posts, manage ideas, and keep your publishing workflow organized while staying connected to analytics." })}
          ${TrustCard({ title: "AI Features Coming Soon", text: "Future capabilities include strategy summaries, publishing recommendations, forecasting, audience analysis, content opportunities, and draft quality feedback." })}
          ${TrustCard({ title: "Security", text: "Metrillix connects securely using LinkedIn OAuth and only accesses Company Pages that you explicitly authorize." })}
        </div>
      </section>

      ${ComingSoonSection()}

      ${CTASection({
        title: "Start understanding your LinkedIn performance with confidence.",
        text: "Join Metrillix and discover analytics designed to support smarter content decisions.",
        primary: "Get Started",
        secondary: "Contact"
      })}
    </main>
    ${PublicFooter()}
  `;
}

function PricingPage() {
  const comparisonRows = [
    { feature: "Company Pages", free: "1 page", growth: "1 page", enterprise: "Up to 5 pages" },
    { feature: "Historical data", free: "Recent analytics", growth: "Full historical analytics", enterprise: "Full cross-page history" },
    { feature: "Trend charts", free: "Basic", growth: "Advanced", enterprise: "Advanced by page and portfolio" },
    { feature: "Content Workspace", free: "Limited", growth: "Included", enterprise: "Included across pages" },
    { feature: "AI recommendations", free: "Coming soon", growth: "Future capability", enterprise: "Expanded priority access" },
    { feature: "Priority support", free: "Standard", growth: "Priority updates", enterprise: "Priority support" },
    { feature: "Future updates", free: "Core updates", growth: "Priority feature access", enterprise: "Priority roadmap access" }
  ];

  return `
    ${TopNav()}
    <main class="simple-home pricing-page-full">
      <section class="simple-hero product-hero">
        <p class="eyebrow">Pricing</p>
        <h1>Simple pricing that grows with your business.</h1>
        <p>Whether you're exploring LinkedIn analytics for the first time or managing a growing brand, Metrillix offers straightforward plans designed around your needs.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get Started</button>
          <a class="secondary-button" href="mailto:hello@metrillix.com">Contact</a>
        </div>
      </section>

      ${PricingSection()}

      <section class="simple-section comparison-section">
        ${SectionHeader({
          eyebrow: "Compare Plans",
          title: "Choose the workspace that fits your team today.",
          text: "Every subscription begins with a one-month free trial."
        })}
        ${ComparisonTable({ rows: comparisonRows })}
      </section>

      <section class="simple-section wide-section">
        ${SectionHeader({
          eyebrow: "What's included",
          title: "Focused analytics without unnecessary complexity.",
          text: "Each plan is designed around clear LinkedIn Company Page reporting, practical performance review, and a simple publishing workflow."
        })}
        <div class="feature-grid">
          ${FeatureCard({ title: "Basic analytics", text: "Understand recent post insights and core page performance signals." })}
          ${FeatureCard({ title: "Trend analysis", text: "Review visual charts that help reveal changes in reach, engagement, and consistency." })}
          ${FeatureCard({ title: "Performance insights", text: "Identify stronger content and useful publishing patterns over time." })}
          ${FeatureCard({ title: "Content Workspace", text: "Keep ideas and upcoming posts organized beside your analytics." })}
          ${FeatureCard({ title: "Priority feature access", text: "Growth and Enterprise subscribers receive priority access as new capabilities roll out." })}
          ${FeatureCard({ title: "Multi-page management", text: "Enterprise supports up to five LinkedIn Company Pages from one Metrillix account." })}
          ${FeatureCard({ title: "Secure LinkedIn OAuth", text: "Connect only the Company Pages you explicitly authorize." })}
        </div>
      </section>

      <section class="simple-section faq-section">
        ${SectionHeader({ eyebrow: "FAQ", title: "Pricing questions", text: "Straight answers for teams comparing plans." })}
        <div class="faq-list">
          ${FAQItem({ question: "Can I cancel anytime?", answer: "Yes. Metrillix is designed to stay straightforward, with no long-term contract." })}
          ${FAQItem({ question: "Will prices increase?", answer: "Current pricing is designed for early customers. If pricing changes later, subscribers will receive clear updates." })}
          ${FAQItem({ question: "Is LinkedIn Premium required?", answer: "No. Metrillix works with authorized LinkedIn Company Pages and does not require LinkedIn Premium." })}
          ${FAQItem({ question: "Can I upgrade later?", answer: "Yes. You can start free and upgrade when your LinkedIn analytics workflow grows." })}
          ${FAQItem({ question: "Is there a free trial?", answer: "Every paid subscription begins with a one-month free trial." })}
        </div>
      </section>

      <section class="simple-section ai-coming-soon-section">
        <div class="ai-coming-soon reveal">
          <div class="ai-coming-soon-copy">
            <p class="eyebrow">Future AI plans</p>
            <h2>Advanced AI capabilities are planned for future premium plans.</h2>
            <p>Upcoming tools may include publishing recommendations, performance forecasting, audience behavior analysis, content opportunity detection, and draft quality feedback.</p>
          </div>
          <div class="ai-coming-soon-panel">
            <span>Enterprise</span>
            <ul>
              <li>Manage up to 5 LinkedIn Company Pages</li>
              <li>Cross-page reporting for teams and agencies</li>
              <li>Priority support and onboarding guidance</li>
              <li>Expanded business intelligence options</li>
            </ul>
          </div>
        </div>
      </section>

      ${CTASection({
        title: "Choose the plan that fits your team today.",
        text: "Start understanding your LinkedIn performance with clarity.",
        primary: "Get Started",
        secondary: "Contact"
      })}
    </main>
    ${PublicFooter()}
  `;
}

function AboutPage() {
  return `
    ${TopNav()}
    <main class="simple-home about-page">
      <section class="simple-hero about-hero">
        <p class="eyebrow">About Metrillix</p>
        <h1>Helping organizations understand the impact of their LinkedIn presence.</h1>
        <p>Metrillix was created to simplify LinkedIn Company Page analytics by transforming complex reporting into clear, actionable insights.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get Started</button>
          <button class="secondary-button" data-route="/features">Explore Features</button>
        </div>
      </section>

      <section class="simple-section split-section">
        ${SectionHeader({
          eyebrow: "Our Mission",
          title: "Make professional analytics accessible, intuitive, and useful.",
          text: "Our mission is to make professional analytics accessible, intuitive, and genuinely useful for businesses of every size."
        })}
        <p class="section-support reveal">We believe understanding performance should never require navigating complicated reports or exporting spreadsheets.</p>
      </section>

      <section class="simple-section split-section">
        ${SectionHeader({
          eyebrow: "Our Vision",
          title: "A platform for confident LinkedIn measurement.",
          text: "We envision a platform where organizations can confidently measure, understand, and improve their LinkedIn presence through intelligent analytics and meaningful insights."
        })}
      </section>

      <section class="simple-section split-section">
        ${SectionHeader({
          eyebrow: "Our Story",
          title: "Built from the friction of fragmented reporting.",
          text: "Many organizations publish consistently but struggle to understand what truly drives engagement. Existing analytics often require navigating multiple pages, manually comparing time periods, and interpreting disconnected metrics."
        })}
      </section>

      <section class="simple-section split-section">
        ${SectionHeader({
          eyebrow: "Why We Built Metrillix",
          title: "Clarity instead of complexity.",
          text: "Metrillix brings insights together into one focused workspace designed for clarity rather than complexity."
        })}
      </section>

      <section class="simple-section wide-section">
        ${SectionHeader({
          eyebrow: "Core Principles",
          title: "The product values behind every page.",
          text: "Metrillix is built around simplicity, transparency, security, and continuous improvement."
        })}
        <div class="feature-grid">
          ${FeatureCard({ title: "Simplicity", text: "Clear dashboards that prioritize meaningful information." })}
          ${FeatureCard({ title: "Transparency", text: "Straightforward analytics without unnecessary complexity." })}
          ${FeatureCard({ title: "Security", text: "Your data remains yours, with access limited to authorized Company Pages through LinkedIn OAuth." })}
          ${FeatureCard({ title: "Continuous Improvement", text: "We constantly improve Metrillix based on user feedback and emerging technologies." })}
        </div>
      </section>

      <section class="simple-section">
        ${SectionHeader({
          eyebrow: "Privacy Commitment",
          title: "We respect your privacy.",
          text: "Metrillix never accesses personal messages, personal profile analytics, or unauthorized Company Pages. We do not sell customer data, and every account remains securely isolated."
        })}
      </section>

      <section class="simple-section faq-section">
        ${SectionHeader({
          eyebrow: "FAQ",
          title: "Frequently Asked Questions",
          text: "Quick answers for teams evaluating Metrillix."
        })}
        <div class="faq-list">
          ${FAQItem({ question: "Do I need LinkedIn Premium?", answer: "No. Metrillix works with authorized LinkedIn Company Pages and does not require a LinkedIn Premium subscription." })}
          ${FAQItem({ question: "Does Metrillix access my personal LinkedIn profile?", answer: "No. Metrillix only accesses Company Page data that you explicitly authorize through LinkedIn OAuth." })}
          ${FAQItem({ question: "Is my data secure?", answer: "Yes. Authentication is handled securely through LinkedIn OAuth, and your analytics remain isolated within your account." })}
          ${FAQItem({ question: "Can I disconnect my LinkedIn account?", answer: "Yes. You can revoke access at any time through your LinkedIn account settings." })}
          ${FAQItem({ question: "Will AI features cost extra?", answer: "Some advanced AI capabilities may be included in future premium plans. Existing subscribers will receive updates as features become available." })}
          ${FAQItem({ question: "Who is Metrillix for?", answer: "Metrillix is designed for businesses, founders, agencies, creators, and marketing teams who manage LinkedIn Company Pages." })}
        </div>
      </section>

      ${CTASection({
        title: "Join our journey.",
        text: "We're building a platform that helps businesses make better decisions through better analytics. Whether you're a founder, marketer, creator, or growing organization, we'd love for you to be part of it."
      })}
    </main>
    ${PublicFooter()}
  `;
}

function CTASection({ title, text, primary = "Get Started", secondary = "Contact" }) {
  return `
    <section class="simple-section cta-section final-cta reveal">
      <div class="cta-copy">
        <p class="eyebrow">Start with clarity</p>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
      </div>
      <div class="hero-actions">
        <button class="primary-button" data-route="/signup">${escapeHtml(primary)}</button>
        <button class="secondary-button" data-route="/contact">${escapeHtml(secondary)}</button>
      </div>
    </section>
  `;
}

function DashboardPreview() {
  return `
    <figure class="intelligence-showcase reveal" aria-label="Metrillix intelligence studio product preview" data-parallax-card>
      <div class="showcase-orbit showcase-orbit-one" aria-hidden="true"></div>
      <div class="showcase-orbit showcase-orbit-two" aria-hidden="true"></div>
      <div class="studio-window">
        <div class="studio-toolbar">
          <div class="window-controls" aria-hidden="true"><i></i><i></i><i></i></div>
          <span>Executive review</span>
          <strong>LinkedIn intelligence brief</strong>
          <small>Ready in 2 min</small>
        </div>
        <div class="studio-command">
          <span>AI summary</span>
          <h3>Founder-led practical posts are creating the clearest demand signal.</h3>
          <p>Keep the educational angle, tighten the opening line, and publish the follow-up while the conversation is still active.</p>
        </div>
        <div class="studio-evidence-grid">
          <article>
            <span>Best next action</span>
            <strong>Turn the top post into a 3-part series</strong>
          </article>
          <article>
            <span>Audience signal</span>
            <strong>Decision makers saved the practical checklist</strong>
          </article>
        </div>
        <div class="studio-footer-strip">
          <div>
            <span>Report quality</span>
            <strong>Board-ready</strong>
          </div>
          <div>
            <span>Content plan</span>
            <strong>4 drafts queued</strong>
          </div>
        </div>
      </div>
      <div class="floating-card floating-card-score">
        <span>Recommendation</span>
        <strong>Ship the follow-up Tuesday</strong>
        <p>Higher executive engagement window detected.</p>
      </div>
      <div class="floating-card floating-card-report">
        <span>Weekly report</span>
        <div class="report-lines" aria-hidden="true"><i></i><i></i><i></i></div>
        <strong>Summary exported</strong>
      </div>
      <div class="floating-card floating-card-plan">
        <span>Content queue</span>
        <strong>Proof, lesson, opinion</strong>
      </div>
    </figure>
  `;
}

function InsightPill({ label, value }) {
  return `
    <article class="insight-pill reveal">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function BenefitPanel({ label, title, text }) {
  return `
    <article class="benefit-panel reveal">
      <span>${escapeHtml(label)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function PricingSection({ compact = false } = {}) {
  return `
    <section class="simple-section pricing-section premium-pricing" id="pricing">
      ${SectionHeader({
        eyebrow: "Pricing",
        title: compact ? "Start free. Upgrade when LinkedIn becomes a decision system." : "Pricing that stays simple while the product gets smarter.",
        text: "Every paid subscription starts with 1 month free. No setup fee, no long-term contract."
      })}
      <div class="pricing-grid core-pricing-grid">
        ${PricingCard({
          label: "Free",
          name: "Starter",
          description: "For one LinkedIn Company Page and a clearer first read on performance.",
          price: "$0",
          features: ["One Company Page", "Core page overview", "Recent post signals", "Manual sync", "Content workspace preview"],
          buttonText: "Start free"
        })}
        ${PricingCard({
          label: "1 month free",
          name: "Growth",
          description: "For teams that want reporting, planning, and priority intelligence features.",
          price: "$9.99",
          features: ["Historical intelligence", "Weekly report briefs", "Content planning workspace", "Priority feature access", "Future AI recommendations"],
          featured: true,
          buttonText: "Try Growth free",
          billingPlan: "growth"
        })}
        ${PricingCard({
          label: "5 pages",
          name: "Enterprise",
          description: "For agencies and teams managing several LinkedIn Company Pages from one account.",
          price: "Custom",
          features: ["Manage up to 5 Company Pages", "Cross-page analytics", "Executive-ready reporting", "Priority support", "Expanded AI recommendations"],
          buttonText: "Choose Enterprise",
          billingPlan: "enterprise"
        })}
      </div>
    </section>
  `;
}

function SecurityStrip() {
  return `
    <section class="simple-section security-strip" id="privacy">
      <div class="security-copy reveal">
        <p class="eyebrow">Security</p>
        <h2>Connected carefully. Reported clearly.</h2>
        <p>Metrillix uses LinkedIn OAuth and only accesses the Company Pages you explicitly authorize. We do not access personal messages, private conversations, or personal profile analytics.</p>
      </div>
      <div class="security-grid">
        ${TrustCard({ title: "OAuth authorization", text: "No LinkedIn passwords are stored by Metrillix." })}
        ${TrustCard({ title: "Company Page scope", text: "Access is limited to authorized organization data." })}
        ${TrustCard({ title: "Account isolation", text: "Reports, drafts, and workspace data stay inside your account." })}
      </div>
    </section>
  `;
}

function PublicFooter() {
  return `
    <footer class="simple-footer">
      <div class="footer-brand">
        <strong>Metrillix</strong>
        <span>LinkedIn intelligence for clearer business decisions.</span>
      </div>
      <nav>
        <button class="footer-link" data-route="/features">Features</button>
        <button class="footer-link" data-route="/pricing">Pricing</button>
        <button class="footer-link" data-route="/about">About</button>
        <button class="footer-link" data-route="/contact">Contact</button>
        <button class="footer-link" data-route="/cookie-policy">Cookie Policy</button>
      </nav>
    </footer>
  `;
}

function WelcomePage() {
  return `
    ${TopNav()}
    <main class="simple-home premium-home">
      <section class="simple-hero home-hero premium-hero" id="home">
        <div class="hero-copy reveal">
          <h1>LinkedIn Intelligence, Simplified.</h1>
          <p>Turn your LinkedIn Company Page performance into executive-ready insights, strategic recommendations, and a clear action plan.</p>
          <div class="hero-actions">
            <button class="primary-button" data-route="/signup">Start free</button>
            <button class="secondary-button" data-route="/features">View features</button>
          </div>
        </div>
        ${DashboardPreview()}
      </section>

      <section class="simple-section problem-section" id="problem">
        ${SectionHeader({
          eyebrow: "Why it exists",
          title: "LinkedIn analytics shows what happened. Metrillix helps decide what to do next.",
          text: "Turn scattered performance signals into a calmer weekly review: what changed, what mattered, and which move deserves attention."
        })}
        <div class="insight-pill-row">
          ${InsightPill({ label: "Review", value: "Clear performance signal" })}
          ${InsightPill({ label: "Decide", value: "Actionable recommendation" })}
          ${InsightPill({ label: "Share", value: "Executive-ready brief" })}
        </div>
        <div class="benefit-grid">
          ${BenefitPanel({ label: "01", title: "Summaries executives can read", text: "Condense page movement, strongest content, and next steps into a brief that does not require analytics translation." })}
          ${BenefitPanel({ label: "02", title: "Recommendations with context", text: "Understand which topics, timing patterns, and follow-up opportunities deserve another bet." })}
          ${BenefitPanel({ label: "03", title: "Planning close to the evidence", text: "Turn the strongest signals into upcoming content direction without rebuilding the analysis each week." })}
        </div>
      </section>

      ${SecurityStrip()}

      ${CTASection({
        title: "Turn LinkedIn performance into your next clear move.",
        text: "Connect a Company Page and start building a calmer reporting rhythm today.",
        primary: "Start free",
        secondary: "Talk to us"
      })}
    </main>
    ${PublicFooter()}
  `;
}

function FeaturesPage() {
  return `
    ${TopNav()}
    <main class="simple-home product-page premium-subpage">
      <section class="simple-hero product-hero">
        <p class="eyebrow">Features</p>
        <h1>The Metrillix intelligence workflow.</h1>
        <p>Features are organized around the job your team is trying to finish: understand the signal, make the call, and plan the next piece of content.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get started</button>
          <button class="secondary-button" data-route="/pricing">View pricing</button>
        </div>
      </section>

      <section class="simple-section workflow-section">
        ${SectionHeader({
          eyebrow: "Workflow",
          title: "From LinkedIn metrics to business decisions.",
          text: "Connect your Company Page, identify the signals that matter, generate an executive-ready brief, and turn insights into your next content plan."
        })}
        ${WorkflowStepper({ steps: [
          { number: "01", title: "Connect LinkedIn", text: "Authorize the Company Pages you manage using secure LinkedIn OAuth." },
          { number: "02", title: "Read the signal", text: "Analyze engagement, reach, audience behaviour, timing, and content performance." },
          { number: "03", title: "Generate the brief", text: "Transform performance into an executive-ready summary with practical recommendations." },
          { number: "04", title: "Plan the next move", text: "Turn recommendations into your next content draft, reporting note, or publishing strategy." }
        ]})}
      </section>

      <section class="simple-section feature-depth-section">
        ${SectionHeader({
          eyebrow: "Capabilities",
          title: "Built around the weekly LinkedIn review workflow.",
          text: "A focused set of capabilities for turning performance into decisions."
        })}
        <div class="feature-tour-grid">
          ${TrustCard({ title: "AI summaries", text: "Plain-language performance narratives for weekly reviews and stakeholder updates." })}
          ${TrustCard({ title: "Actionable recommendations", text: "Guidance on topics, formats, hooks, timing, and follow-up opportunities." })}
          ${TrustCard({ title: "Executive reports", text: "Clean summaries your team can share without exporting spreadsheets." })}
          ${TrustCard({ title: "Content planning", text: "A workspace for turning insights into draft ideas and publishing direction." })}
        </div>
      </section>

      ${CTASection({
        title: "Build a better LinkedIn review ritual.",
        text: "Start with the workflow, then let the intelligence layer guide your next content decision.",
        primary: "Start free",
        secondary: "Contact"
      })}
    </main>
    ${PublicFooter()}
  `;
}

function PricingPage() {
  const comparisonRows = [
    { feature: "Company Pages", free: "1 page", growth: "1 page", enterprise: "Up to 5 pages" },
    { feature: "Core performance overview", free: "Included", growth: "Included", enterprise: "Included across pages" },
    { feature: "Historical intelligence", free: "Limited", growth: "Included", enterprise: "Portfolio-level history" },
    { feature: "Report briefs", free: "Preview", growth: "Included", enterprise: "Executive and cross-page briefs" },
    { feature: "Content planning", free: "Preview", growth: "Included", enterprise: "Included across pages" },
    { feature: "AI recommendations", free: "Future preview", growth: "Priority access", enterprise: "Expanded priority access" },
    { feature: "Support", free: "Standard", growth: "Priority updates", enterprise: "Priority support" }
  ];

  return `
    ${TopNav()}
    <main class="simple-home pricing-page-full premium-subpage">
      <section class="simple-hero product-hero">
        <p class="eyebrow">Pricing</p>
        <h1>Simple plans for a smarter reporting rhythm.</h1>
        <p>Start free, then upgrade when your LinkedIn presence becomes a serious channel for growth, trust, and demand.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Start free</button>
          <button class="secondary-button" data-route="/contact">Contact</button>
        </div>
      </section>

      ${PricingSection()}

      <section class="simple-section comparison-section">
        ${SectionHeader({
          eyebrow: "Compare",
          title: "Choose the level of intelligence you need right now.",
          text: "Starter keeps the first page simple. Growth adds deeper reporting. Enterprise expands Metrillix for up to five managed pages."
        })}
        ${ComparisonTable({ rows: comparisonRows })}
      </section>

      <section class="simple-section faq-section">
        ${SectionHeader({ eyebrow: "FAQ", title: "Pricing questions", text: "Straight answers for teams evaluating Metrillix." })}
        <div class="faq-list">
          ${FAQItem({ question: "Can I cancel anytime?", answer: "Yes. Metrillix has no long-term contract." })}
          ${FAQItem({ question: "Is there a free trial?", answer: "Every paid subscription begins with a one-month free trial." })}
          ${FAQItem({ question: "Do I need LinkedIn Premium?", answer: "No. Metrillix works with authorized LinkedIn Company Pages and does not require LinkedIn Premium." })}
          ${FAQItem({ question: "What does Enterprise add?", answer: "Enterprise is designed for teams managing up to five LinkedIn Company Pages with cross-page reporting, priority support, and expanded AI planning access." })}
          ${FAQItem({ question: "Will AI features be available to Growth users?", answer: "Growth subscribers receive priority access as advanced intelligence features roll out. Enterprise receives the broadest AI planning access as those features mature." })}
        </div>
      </section>

      ${CTASection({
        title: "Start free and upgrade when the signal is worth scaling.",
        text: "Metrillix keeps pricing clear so your team can focus on decisions.",
        primary: "Start free",
        secondary: "Talk to us"
      })}
    </main>
    ${PublicFooter()}
  `;
}

function AboutPage() {
  return `
    ${TopNav()}
    <main class="simple-home about-page premium-subpage">
      <section class="simple-hero about-hero">
        <p class="eyebrow">About Metrillix</p>
        <h1>We believe performance data should become business clarity.</h1>
        <p>Metrillix exists because LinkedIn analytics shows what happened, but teams still need help deciding what to do next.</p>
        <div class="hero-actions">
          <button class="primary-button" data-route="/signup">Get started</button>
          <button class="secondary-button" data-route="/contact">Contact</button>
        </div>
      </section>

      <section class="simple-section split-section about-manifesto">
        ${SectionHeader({
          eyebrow: "Point of view",
          title: "The future of analytics is less dashboard, more decision.",
          text: "Marketing teams already have enough numbers. Metrillix is built around interpretation: summaries, recommendations, reporting artifacts, and planning context."
        })}
        <p class="section-support reveal">Our design principle is simple: remove every surface that does not help someone make a better LinkedIn decision.</p>
      </section>

      <section class="simple-section wide-section">
        ${SectionHeader({
          eyebrow: "Principles",
          title: "What guides the product.",
          text: "The platform is still growing, but the standards are already clear."
        })}
        <div class="benefit-grid principles-grid">
          ${BenefitPanel({ label: "Clarity", title: "Write for the decision maker", text: "Every report should be readable by someone who does not live in the dashboard." })}
          ${BenefitPanel({ label: "Calm", title: "Lower the cognitive load", text: "The interface should feel quiet, confident, and precise." })}
          ${BenefitPanel({ label: "Trust", title: "Respect permission boundaries", text: "LinkedIn access should be explicit, scoped, and easy to understand." })}
          ${BenefitPanel({ label: "Momentum", title: "Turn review into action", text: "Insights matter most when they become better content and clearer priorities." })}
        </div>
      </section>

      ${CTASection({
        title: "Help shape calmer LinkedIn intelligence.",
        text: "Tell us what would make your LinkedIn reporting workflow clearer.",
        primary: "Start free",
        secondary: "Contact"
      })}
    </main>
    ${PublicFooter()}
  `;
}

function ContactPage() {
  return `
    ${TopNav()}
    <main class="simple-home contact-page premium-subpage">
      <section class="simple-hero product-hero contact-hero">
        <p class="eyebrow">Contact</p>
        <h1>Questions, support, partnerships, or feedback.</h1>
        <p>Tell us what you are trying to understand from LinkedIn. We read every message and use early conversations to shape the product.</p>
        <div class="hero-actions">
          <a class="primary-button" href="mailto:hello@metrillix.com">Email hello@metrillix.com</a>
          <button class="secondary-button" data-route="/signup">Start free</button>
        </div>
      </section>

      <section class="simple-section contact-options">
        ${SectionHeader({
          eyebrow: "How we can help",
          title: "Choose the conversation that fits.",
          text: "Metrillix is early, focused, and intentionally close to customer feedback."
        })}
        <div class="feature-tour-grid">
          ${TrustCard({ title: "Product questions", text: "Ask how Metrillix handles reports, planning, LinkedIn access, or future AI recommendations." })}
          ${TrustCard({ title: "Support", text: "Get help with signup, login, LinkedIn connection, organization selection, or account access." })}
          ${TrustCard({ title: "Partnerships", text: "Reach out if you support founders, agencies, or B2B teams with LinkedIn growth." })}
          ${TrustCard({ title: "Product feedback", text: "Share the reporting workflow you wish existed. Specific friction is especially useful." })}
        </div>
      </section>
    </main>
    ${PublicFooter()}
  `;
}

function CookiePolicyPage() {
  return `
    ${TopNav()}
    <main class="page-shell policy-page">
      <section>
        <p class="eyebrow">Cookie Policy</p>
        <h1>How Metrillix uses cookies</h1>
        <p class="muted">Metrillix uses essential cookies to keep your account secure, remember your session, and protect authenticated dashboard requests. These cookies are required for login, LinkedIn connection, drafts, publishing, and analytics pages to work.</p>
      </section>
      <section class="policy-block">
        <h2>Essential cookies</h2>
        <p>We set a secure session cookie after signup or login. It helps verify that dashboard and API requests belong to your Metrillix account. The cookie is HttpOnly, Secure, SameSite=Lax, and expires automatically.</p>
      </section>
      <section class="policy-block">
        <h2>Preference cookies</h2>
        <p>We store your cookie notice choice in your browser so the notice does not keep appearing. This preference does not contain account analytics, drafts, LinkedIn tokens, or LinkedIn page data.</p>
      </section>
      <section class="policy-block">
        <h2>LinkedIn cookies</h2>
        <p>When you connect LinkedIn, LinkedIn may use its own cookies on linkedin.com to authenticate your LinkedIn account and confirm the company pages you manage. Metrillix does not control LinkedIn cookies.</p>
      </section>
      <section class="policy-block">
        <h2>LinkedIn page access</h2>
        <p>Metrillix is built for LinkedIn company pages, not personal profile analytics. You can disconnect LinkedIn from Metrillix at any time, and you can also revoke access from your LinkedIn security settings.</p>
      </section>
      ${BackButton({ fallback: "/" })}
    </main>
    ${CookieBanner()}
  `;
}

function SharedReportPage() {
  return `
    ${TopNav({ right: "public" })}
    <main class="page-shell shared-report-shell">
      <section class="legal-page shared-report-page" id="sharedReport">
        <p class="empty-state">Loading shared report.</p>
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
        <h1>Start with Metrillix</h1>
        <form data-auth="signup">
          <label>Name<input name="name" autocomplete="name" required></label>
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
          <button class="primary-button full" type="submit">Sign up</button>
        </form>
        <p class="muted">Already have an account? <button class="inline-link" data-route="/login">Log in</button></p>
      </section>
      ${BackButton({ fallback: "/" })}
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
        <p class="muted">New to Metrillix? <button class="inline-link" data-route="/signup">Create an account</button></p>
      </section>
      ${BackButton({ fallback: "/" })}
    </main>
  `;
}

function AdminPage() {
  return `
    ${TopNav({ right: "dashboard" })}
    <main class="page-shell dashboard-shell admin-shell">
      <section class="dashboard-header">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>Metrillix Accounts</h1>
          <p class="muted">Review registrations, plan status, and LinkedIn connection readiness before Stripe is connected.</p>
        </div>
        <div class="button-row">
          <button class="secondary-button" type="button" data-route="/">Main site</button>
          <button class="primary-button" type="button" data-admin-refresh>Refresh</button>
        </div>
      </section>

      <section class="admin-summary-grid" id="adminSummary">
        <article class="metric-card"><span>Total accounts</span><strong>--</strong></article>
        <article class="metric-card"><span>Admins</span><strong>--</strong></article>
        <article class="metric-card"><span>LinkedIn connected</span><strong>--</strong></article>
      </section>

      <section class="table-section admin-table-section">
        <div class="section-heading-row">
          <div>
            <h2>Registered Users</h2>
            <p class="muted">Sensitive password fields are not returned to this view.</p>
          </div>
        </div>
        <div id="adminAccounts">
          <p class="empty-state">Loading accounts.</p>
        </div>
      </section>
    </main>
  `;
}

function BillingSuccessPage() {
  return `
    ${TopNav({ right: hasActiveSession() ? "dashboard" : "login" })}
    <main class="page-shell auth-shell">
      <section class="auth-card billing-result-card">
        <p class="eyebrow">Billing</p>
        <h1>Checkout started</h1>
        <p class="muted">Stripe is confirming the subscription. Your account will update automatically after the billing webhook arrives.</p>
        <div class="button-row">
          <button class="primary-button" data-route="/dashboard">Open dashboard</button>
          <button class="secondary-button" data-route="/pricing">Pricing</button>
        </div>
      </section>
    </main>
  `;
}

function BillingCancelPage() {
  return `
    ${TopNav({ right: hasActiveSession() ? "dashboard" : "login" })}
    <main class="page-shell auth-shell">
      <section class="auth-card billing-result-card">
        <p class="eyebrow">Billing</p>
        <h1>Checkout was canceled</h1>
        <p class="muted">No payment was completed. You can return to pricing whenever you are ready.</p>
        <div class="button-row">
          <button class="primary-button" data-billing-checkout="growth">Try Growth free</button>
          <button class="secondary-button" data-route="/pricing">Pricing</button>
        </div>
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
      ${BackButton({ fallback: "/login" })}
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
      ${BackButton({ fallback: "/login" })}
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
      ${BackButton({ fallback: "/dashboard" })}
    </main>
  `;
}

function ConnectLinkedInStep() {
  const helper = linkedInOAuthStatus?.configured === false
    ? "Connect through Metrillix. If LinkedIn setup is still being finalized, Metrillix will show what needs attention without storing LinkedIn tokens in your browser."
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
    <p class="muted">Choose the LinkedIn company page Metrillix should use for post sync and analytics.</p>
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
    <p class="muted">Metrillix has an active LinkedIn company page. You can now load the analytics dashboard.</p>
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
          <h1>Workspace Analytics</h1>
          <p class="muted" id="dashboardOrg">Loading selected organization.</p>
        </div>
        <div class="dashboard-actions">
          <button class="primary-button" data-sync-linkedin>Sync Data</button>
          <button class="secondary-button" data-route="/create-post">Create Post</button>
          <button class="secondary-button" data-route="/dashboard/analytics">Dashboard View</button>
          <button class="secondary-button" type="button" data-billing-portal>Manage Billing</button>
          <details class="workspace-menu">
            <summary>Workspace Actions</summary>
            <div>
              <button type="button" data-route="/dashboard/onboarding">Manage Pages</button>
              <button class="danger" type="button" data-disconnect-linkedin>Disconnect LinkedIn</button>
            </div>
          </details>
        </div>
      </section>
      <section class="sync-panel" id="syncStatusPanel"></section>
      <section class="metrics-grid" id="metricsGrid"></section>
      <section class="dashboard-split-grid">
        <article class="dashboard-workflow-card" id="weeklySnapshotPanel">
          <p class="empty-state">Loading weekly snapshot.</p>
        </article>
        <article class="dashboard-workflow-card" id="shareReportPanel">
          <p class="empty-state">Loading report sharing.</p>
        </article>
      </section>
      <section class="table-section">
        <div class="section-heading">
          <h2>Recent posts</h2>
          <p class="muted">Normalized from the selected LinkedIn organization.</p>
        </div>
        <div class="post-list" id="postList"></div>
      </section>
      ${BackButton({ fallback: "/" })}
    </main>
  `;
}

function AnalyticsDashboardPage() {
  return `
    ${TopNav({ right: "dashboard" })}
    <main class="analytics-app-shell">
      <section class="analytics-main">
        <header class="analytics-header">
          <div>
            <p class="eyebrow">Account Analytics</p>
            <h1>Workspace Analytics</h1>
            <p class="muted" id="analyticsOrg">Loading selected company page.</p>
          </div>
          <div class="analytics-plan-card" id="analyticsPlanCard">
            <span>Plan</span>
            <strong>Loading</strong>
          </div>
          <div class="button-row">
            <button class="secondary-button" type="button" data-route="/dashboard">Individual view</button>
            <button class="primary-button" type="button" data-sync-linkedin>Sync LinkedIn</button>
            <button class="secondary-button" type="button" data-route="/create-post">Create post</button>
          </div>
        </header>
        <form class="analytics-filters" data-analytics-filters>
          <label>Date range
            <select name="range">
              <option value="7">Last 7 days</option>
              <option value="30" selected>Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>From
            <input name="from" type="date">
          </label>
          <label>To
            <input name="to" type="date">
          </label>
          <label>Media type
            <select name="mediaType">
              <option value="all">All media</option>
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="carousel">Carousel</option>
              <option value="video">Video</option>
              <option value="document">Document</option>
              <option value="poll">Poll</option>
            </select>
          </label>
          <label>Sort posts by
            <select name="sortBy">
              <option value="date">Date</option>
              <option value="impressions">Impressions</option>
              <option value="engagement">Engagement</option>
              <option value="engagement_rate">Engagement rate</option>
              <option value="clicks">Clicks</option>
            </select>
          </label>
          <button class="primary-button" type="submit">Apply</button>
        </form>
        <section class="analytics-empty" id="analyticsEmpty" hidden>
          <p class="empty-state">No LinkedIn analytics yet. Connect LinkedIn and run sync from the individual view.</p>
        </section>
        <section class="analytics-overview-grid" id="analyticsOverview"></section>
        <section class="analytics-chart-grid analytics-trend-grid">
          <article class="analytics-panel">
            <div class="section-heading"><h2>Reach Trend</h2></div>
            <div id="reachChart"></div>
          </article>
          <article class="analytics-panel">
            <div class="section-heading"><h2>Engagement Trend</h2></div>
            <div id="engagementChart"></div>
          </article>
        </section>
        <section class="analytics-insight-cards" id="analyticsInsights"></section>
        <section class="analytics-panel best-time-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Best Time To Post</p>
              <h2>Timing recommendations</h2>
            </div>
          </div>
          <div id="bestTimePanel">
            <p class="empty-state">Loading timing signals.</p>
          </div>
        </section>
        <section class="analytics-panel decision-panel">
          <div class="section-heading">
            <div>
              <h2>Recommended next moves</h2>
              <p class="muted">Rules-based decisions from this workspace history.</p>
            </div>
          </div>
          <div class="decision-list" id="analyticsRecommendations"></div>
          <article class="dashboard-coming-soon">
            <span>Coming Soon</span>
            <strong>AI recommendations are on the way</strong>
            <p>Premium strategy briefs and next-post recommendations will appear here once the AI analytics layer is ready.</p>
          </article>
        </section>
        <section class="analytics-table-grid" id="posts">
          <article class="analytics-panel analytics-wide-panel">
            <div class="section-heading"><h2>Top Posts</h2></div>
            <div id="topPostsTable"></div>
          </article>
        </section>
        ${BackButton({ fallback: "/dashboard" })}
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
        <article class="content-score-panel" id="contentScorePanel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Content Score</p>
              <h2>Publishing readiness</h2>
            </div>
            <strong id="contentScoreValue">0/100</strong>
          </div>
          <div id="contentScoreResult">
            <p class="empty-state">Write a draft to see a rules-based score.</p>
          </div>
        </article>
        <section class="draft-list-panel">
          <div class="section-heading">
            <h2>Saved drafts</h2>
            <p class="muted">Save drafts here, then publish them to the selected LinkedIn page when ready.</p>
          </div>
          <div class="draft-list" id="draftList">
            <p class="empty-state">Loading drafts.</p>
          </div>
        </section>
      </section>
      ${AdInspirationPanel()}
      ${BackButton({ fallback: "/dashboard" })}
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
  await Promise.all([
    loadWeeklySnapshot(),
    loadShareReportPanel()
  ]);

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

async function loadWeeklySnapshot() {
  const target = document.querySelector("#weeklySnapshotPanel");
  if (!target) return;
  target.innerHTML = `<p class="empty-state">Loading weekly snapshot.</p>`;
  try {
    const [result, email] = await Promise.all([
      api("/api/weekly-snapshot"),
      api("/api/email-status").catch(() => ({ configured: false, missing: ["RESEND_API_KEY", "EMAIL_FROM"] }))
    ]);
    target.innerHTML = WeeklySnapshotCard(result.snapshot, email);
  } catch (error) {
    target.innerHTML = `<p class="empty-state">${escapeHtml(userMessage(error, "Weekly snapshot unavailable."))}</p>`;
  }
}

async function copyWeeklySnapshot() {
  const result = await api("/api/weekly-snapshot");
  const snapshot = result.snapshot || {};
  const metrics = snapshot.metrics || {};
  const text = [
    snapshot.title || "Metrillix weekly snapshot",
    snapshot.summary || "",
    `Posts: ${metrics.posts || 0}`,
    `Impressions: ${formatNumber(metrics.impressions || 0)}`,
    `Engagement: ${formatNumber(metrics.engagement || 0)}`,
    snapshot.bestTime?.day || snapshot.bestTime?.hour ? `Best time: ${[snapshot.bestTime?.day, snapshot.bestTime?.hour].filter(Boolean).join(" ")}` : "",
    snapshot.recommendation || ""
  ].filter(Boolean).join("\n");
  await navigator.clipboard.writeText(text);
  showToast("Weekly snapshot copied");
}

async function sendWeeklySnapshot(button) {
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Sending";
  try {
    const result = await api("/api/weekly-snapshot/send", { method: "POST" });
    showToast(result.emailSent ? "Weekly snapshot sent" : "Email is not configured yet");
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function WeeklySnapshotCard(snapshot = {}, email = {}) {
  const metrics = snapshot.metrics || {};
  const canSend = Boolean(email.configured);
  return `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Weekly Snapshot</p>
        <h2>${escapeHtml(snapshot.title || "This week's LinkedIn summary")}</h2>
      </div>
    </div>
    <div class="snapshot-metrics">
      ${MetricMini("Posts", metrics.posts)}
      ${MetricMini("Impressions", metrics.impressions)}
      ${MetricMini("Engagement", metrics.engagement)}
    </div>
    <p>${escapeHtml(snapshot.summary || "Sync LinkedIn to generate a weekly snapshot.")}</p>
    <p class="email-status-note">${escapeHtml(canSend ? "Email delivery is configured." : `Email delivery needs setup: ${formatMissingEmailConfig(email.missing)}.`)}</p>
    <div class="button-row">
      <button class="secondary-button" type="button" data-copy-weekly-snapshot>Copy summary</button>
      <button class="primary-button" type="button" data-send-weekly-snapshot ${canSend ? "" : "disabled"}>Send to email</button>
    </div>
  `;
}

function formatMissingEmailConfig(missing = []) {
  const items = Array.isArray(missing) && missing.length ? missing : ["RESEND_API_KEY", "EMAIL_FROM"];
  return items.join(", ");
}

function MetricMini(label, value) {
  return `<span><b>${formatNumber(value || 0)}</b>${escapeHtml(label)}</span>`;
}

async function loadShareReportPanel() {
  const target = document.querySelector("#shareReportPanel");
  if (!target) return;
  target.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Shareable Report</p>
        <h2>Client-ready performance link</h2>
      </div>
    </div>
    <p>Create a read-only report URL with this week's summary, key metrics, best post, and timing recommendation.</p>
    <div class="button-row">
      <button class="primary-button" type="button" data-create-share-report>Create share link</button>
    </div>
  `;
}

async function createShareReport(button) {
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Creating";
  try {
    const result = await api("/api/reports/share", { method: "POST", body: JSON.stringify({}) });
    await navigator.clipboard.writeText(result.shareUrl);
    const target = document.querySelector("#shareReportPanel");
    if (target) {
      target.innerHTML = `
        <div class="section-heading">
          <div>
            <p class="eyebrow">Shareable Report</p>
            <h2>Report link copied</h2>
          </div>
        </div>
        <p>This read-only report is ready to share with clients or teammates.</p>
        <div class="button-row">
          <a class="secondary-button" href="${escapeAttribute(result.shareUrl)}" target="_blank" rel="noreferrer">Open report</a>
          <button class="primary-button" type="button" data-create-share-report>Create new link</button>
        </div>
      `;
    }
    showToast("Share report link copied");
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function hydrateSharedReport() {
  const target = document.querySelector("#sharedReport");
  if (!target) return;
  const token = window.location.pathname.split("/").filter(Boolean).pop();
  try {
    const result = await api(`/api/shared-reports/${encodeURIComponent(token)}`);
    target.innerHTML = SharedReportContent(result.report);
  } catch (error) {
    target.innerHTML = `<p class="empty-state">${escapeHtml(userMessage(error, "Shared report unavailable."))}</p>`;
  }
}

function SharedReportContent(report = {}) {
  const snapshot = report.snapshot || {};
  const metrics = snapshot.metrics || {};
  const bestPost = snapshot.bestPost || null;
  const generatedAt = snapshot.generatedAt || report.createdAt;
  const reportTitle = String(report.title || "").trim();
  const displayTitle = !reportTitle || reportTitle.toLowerCase() === "metrillix linkedin performance report"
    ? "LinkedIn Performance Brief"
    : reportTitle;
  const recommendation = String(snapshot.recommendation || "").trim();
  const period = sharedReportPeriod(generatedAt);
  const accountName = report.accountName || "Metrillix workspace";
  return `
    <article class="shared-report-document" aria-label="LinkedIn performance report">
      ${ReportHeader({ title: displayTitle, generatedAt, accountName, period })}
      ${ExecutiveSummary({ snapshot, metrics, bestPost })}
      ${KpiSnapshot({ metrics })}
      ${KeyFindings({ snapshot, metrics, bestPost })}
      ${RecommendedActions({ snapshot, metrics, recommendation })}
      ${TopContent({ bestPost })}
      ${PageHealthScore({ metrics, bestPost })}
      ${ReportFooter({ period })}
    </article>
    <div class="shared-report-actions" aria-label="Report actions">
      <button class="back-button" type="button" data-back data-back-fallback="/">Back</button>
      <div class="shared-report-action-buttons">
        <button class="secondary-button" type="button" data-copy-report-link>Copy Link</button>
        <button class="primary-button" type="button" data-download-report-pdf>Download PDF</button>
      </div>
    </div>
  `;
}

function ReportHeader({ title, generatedAt, accountName, period }) {
  return `
    <header class="shared-report-header">
      <div class="shared-report-brand-row">
        <span class="shared-report-brand">Metrillix</span>
        <span class="shared-report-status">Executive summary</span>
      </div>
      <div class="shared-report-title-row">
        <div>
          <p class="eyebrow">LinkedIn Performance Brief</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <dl class="shared-report-meta" aria-label="Report details">
          <div><dt>Generated</dt><dd>${escapeHtml(formatReportDate(generatedAt))}</dd></div>
          <div><dt>Company page</dt><dd>${escapeHtml(accountName)}</dd></div>
          <div><dt>Reporting period</dt><dd>${escapeHtml(period)}</dd></div>
        </dl>
      </div>
    </header>
  `;
}

function ExecutiveSummary({ snapshot, metrics, bestPost }) {
  return `
    <section class="shared-report-section shared-report-summary">
      <div class="shared-report-section-heading">
        <span>01</span>
        <h2>Executive summary</h2>
      </div>
      <p>${escapeHtml(sharedExecutiveSummary(snapshot, metrics, bestPost))}</p>
    </section>
  `;
}

function KpiSnapshot({ metrics }) {
  const engagementDelta = Number.isFinite(Number(metrics.engagementDelta)) ? Number(metrics.engagementDelta) : null;
  const items = [
    { label: "Posts", value: formatNumber(metrics.posts || 0), badge: Number(metrics.posts || 0) ? "Active" : "Quiet" },
    { label: "Impressions", value: formatNumber(metrics.impressions || 0), badge: Number(metrics.impressions || 0) ? "Visible" : "No reach yet" },
    { label: "Engagement", value: formatNumber(metrics.engagement || 0), badge: engagementDelta === null ? "Baseline" : engagementDelta >= 0 ? "Up" : "Down", trend: engagementDelta },
    { label: "Engagement Rate", value: formatPercent(metrics.engagementRate || 0), badge: sharedEngagementStatus(metrics.engagementRate) }
  ];
  return `
    <section class="shared-report-section shared-report-kpi-section">
      <div class="shared-report-section-heading">
        <span>02</span>
        <h2>KPI snapshot</h2>
      </div>
      <div class="shared-report-kpis" aria-label="Key performance indicators">
        ${items.map((item) => `
          <article class="shared-report-kpi-card">
            <div class="shared-report-kpi-top">
              <span class="shared-report-kpi-label">${escapeHtml(item.label)}</span>
              <small>${escapeHtml(item.badge)}</small>
            </div>
            <strong>${escapeHtml(item.value)}</strong>
            <div class="shared-report-sparkline" aria-hidden="true"><i></i><i></i><i></i></div>
            ${item.trend === null || item.trend === undefined ? `<p>Current period baseline</p>` : `<p class="${item.trend >= 0 ? "positive" : "negative"}">${item.trend >= 0 ? "+" : ""}${formatPercent(item.trend)} vs previous period</p>`}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function KeyFindings({ snapshot, metrics, bestPost }) {
  const windowLabel = sharedBestWindow(snapshot);
  const hasPosts = Number(metrics.posts || 0) > 0;
  const findings = [
    { label: "Best publishing window", text: windowLabel || "More post history is needed before a reliable publishing window can be named." },
    { label: "Top content signal", text: bestPost ? `${truncateText(bestPost.text || "Top post", 96)} performed strongest in this sample.` : "No top content signal is available yet." },
    { label: "Visibility driver", text: bestPost ? "Product, company, or announcement-led updates appear to be the clearest current signal." : "Visibility will become clearer after more posts are synced or published." },
    { label: "Growth constraint", text: hasPosts ? "Low posting volume can limit confidence. A steadier cadence will make the analysis more reliable." : "No posts were detected in the reporting period, so the brief should be treated as a baseline." }
  ];
  return `
    <section class="shared-report-section">
      <div class="shared-report-section-heading">
        <span>03</span>
        <h2>Key findings</h2>
      </div>
      <div class="shared-report-finding-grid">
        ${findings.map((item) => `
          <article class="shared-report-finding">
            <span>${escapeHtml(item.label)}</span>
            <p>${escapeHtml(item.text)}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function RecommendedActions({ snapshot, metrics, recommendation }) {
  const windowLabel = sharedBestWindow(snapshot);
  const posts = Number(metrics.posts || 0);
  const actions = posts
    ? [
        {
          priority: "High",
          action: windowLabel ? `Publish the next product update around ${windowLabel}.` : "Publish the next product update in a controlled weekly slot.",
          reason: windowLabel ? "This is currently the strongest observed publishing window." : "A consistent time slot will create a cleaner benchmark.",
          outcome: "Better chance of early reach and a more reliable comparison point."
        },
        {
          priority: posts < 3 ? "High" : "Medium",
          action: "Increase posting consistency before drawing broad conclusions.",
          reason: "A small sample limits confidence in content and timing patterns.",
          outcome: "Clearer trend lines and stronger recommendations over time."
        },
        {
          priority: "Medium",
          action: recommendation || "Use the strongest post as the starting point for the next content test.",
          reason: "Recent performance should inform the next creative decision.",
          outcome: "More focused content planning and less guesswork."
        }
      ]
    : [
        {
          priority: "High",
          action: "Publish or sync the next LinkedIn Company Page post.",
          reason: "The current report has insufficient performance data.",
          outcome: "A useful baseline for future briefs."
        },
        {
          priority: "Medium",
          action: "Set a weekly publishing rhythm for the next month.",
          reason: "Consistency is required before timing and content patterns become reliable.",
          outcome: "Better visibility into what is working."
        }
      ];
  return `
    <section class="shared-report-section">
      <div class="shared-report-section-heading">
        <span>04</span>
        <h2>Recommended actions</h2>
      </div>
      <div class="shared-report-action-plan">
        ${actions.map((item) => `
          <article class="shared-report-action-item">
            <span class="shared-report-priority">${escapeHtml(item.priority)}</span>
            <div>
              <h3>${escapeHtml(item.action)}</h3>
              <p><strong>Reason:</strong> ${escapeHtml(item.reason)}</p>
              <p><strong>Expected outcome:</strong> ${escapeHtml(item.outcome)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function TopContent({ bestPost }) {
  return `
    <section class="shared-report-section">
      <div class="shared-report-section-heading">
        <span>05</span>
        <h2>Top content</h2>
      </div>
      ${bestPost ? `
        <article class="shared-report-top-content">
          <div>
            <span>Post preview</span>
            <p>${escapeHtml(truncateText(bestPost.text || "Top post", 260))}</p>
          </div>
          <dl>
            <div><dt>Impressions</dt><dd>${formatNumber(bestPost.impressions || 0)}</dd></div>
            <div><dt>Engagement rate</dt><dd>${formatPercent(bestPost.engagementRate || 0)}</dd></div>
          </dl>
          <p class="shared-report-detail">Why it mattered: this was the clearest content signal in the available sample and should inform the next post or announcement.</p>
          ${bestPost.url ? `<a class="secondary-button shared-report-post-link" href="${escapeAttribute(bestPost.url)}" target="_blank" rel="noreferrer">Open LinkedIn post</a>` : ""}
        </article>
      ` : `
        <article class="shared-report-top-content shared-report-empty-card">
          <p>No top post is available yet. Once LinkedIn posts are synced, this section will highlight the strongest content signal and why it matters.</p>
        </article>
      `}
    </section>
  `;
}

function PageHealthScore({ metrics, bestPost }) {
  const score = sharedPageHealth(metrics, bestPost);
  return `
    <section class="shared-report-section shared-report-health-section">
      <div class="shared-report-section-heading">
        <span>06</span>
        <h2>Page health</h2>
      </div>
      ${score.reliable ? `
        <div class="shared-report-health">
          <div class="shared-report-score">
            <span>Page health</span>
            <strong>${score.total} / 100</strong>
          </div>
          <div class="shared-report-health-bars">
            ${score.parts.map((part) => `
              <div>
                <span>${escapeHtml(part.label)}</span>
                <i style="--score-width: ${Math.max(0, Math.min(100, part.value))}%;"></i>
                <strong>${part.value}</strong>
              </div>
            `).join("")}
          </div>
        </div>
      ` : `<p class="shared-report-insufficient">Not enough data for a reliable score yet.</p>`}
    </section>
  `;
}

function ReportFooter({ period }) {
  return `
    <footer class="shared-report-footer">
      <span>Generated by Metrillix</span>
      <span>LinkedIn Performance Brief</span>
      <span>${escapeHtml(period)}</span>
    </footer>
  `;
}

function sharedReportPeriod(generatedAt) {
  const end = generatedAt ? new Date(generatedAt) : new Date();
  if (Number.isNaN(end.getTime())) return "Last 7 days";
  const start = new Date(end.getTime() - 6 * 86400000);
  return `${formatReportDate(start)} - ${formatReportDate(end)}`;
}

function formatReportDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sharedBestWindow(snapshot = {}) {
  const day = snapshot.bestTime?.day;
  const hour = snapshot.bestTime?.hour;
  if (!day && !hour) return "";
  return [day, hour].filter(Boolean).join(", ");
}

function sharedEngagementStatus(value) {
  const rate = Number(value || 0);
  if (rate >= 5) return "Strong";
  if (rate >= 2) return "Healthy";
  if (rate > 0) return "Early signal";
  return "No signal yet";
}

function sharedExecutiveSummary(snapshot = {}, metrics = {}, bestPost = null) {
  const posts = Number(metrics.posts || 0);
  const impressions = Number(metrics.impressions || 0);
  const engagement = Number(metrics.engagement || 0);
  const windowLabel = sharedBestWindow(snapshot);
  if (!posts) {
    return "Your LinkedIn presence was quiet during this period. No posts were detected in the reporting window, so the most useful next step is to publish or sync new content and rebuild a reliable baseline.";
  }
  const volume = posts < 3 ? "remained relatively quiet" : "showed measurable activity";
  const topSignal = bestPost ? "The strongest signal came from the top-performing post, which generated the clearest reach and engagement pattern." : "No single content signal stood out strongly yet.";
  const timing = windowLabel ? `${windowLabel} appears to be the best observed publishing window.` : "There is not enough timing history yet to name a reliable publishing window.";
  const consistency = posts < 4 ? "Increasing posting consistency should improve visibility and confidence in future recommendations." : "Maintaining a steady cadence should make future recommendations more reliable.";
  return `Your LinkedIn presence ${volume} during this period, with ${formatNumber(impressions)} impressions and ${formatNumber(engagement)} engagements. ${topSignal} ${timing} ${consistency}`;
}

function sharedPageHealth(metrics = {}, bestPost = null) {
  const posts = Number(metrics.posts || 0);
  const impressions = Number(metrics.impressions || 0);
  const engagementRate = Number(metrics.engagementRate || 0);
  if (posts < 2 && !impressions) return { reliable: false, total: 0, parts: [] };
  const visibility = Math.min(100, Math.round(impressions / 50));
  const engagement = Math.min(100, Math.round(engagementRate * 12));
  const consistency = Math.min(100, Math.round((posts / 4) * 100));
  const signal = bestPost ? Math.max(35, Math.min(100, Math.round((Number(bestPost.engagementRate || 0) || engagementRate) * 10))) : 20;
  const parts = [
    { label: "Visibility", value: visibility },
    { label: "Engagement", value: engagement },
    { label: "Consistency", value: consistency },
    { label: "Content signal", value: signal }
  ];
  return {
    reliable: true,
    total: Math.round(parts.reduce((sum, part) => sum + part.value, 0) / parts.length),
    parts
  };
}

async function copyCurrentReportLink() {
  await navigator.clipboard.writeText(window.location.href);
  showToast("Report link copied");
}

function downloadSharedReportPdf() {
  document.body.classList.add("printing-report");
  window.print();
  window.setTimeout(() => document.body.classList.remove("printing-report"), 800);
}

async function hydrateAnalyticsDashboard() {
  const details = await loadLinkedInState();
  if (!details.selectedOrganization) {
    renderAnalyticsEmpty();
    return;
  }
  const org = document.querySelector("#analyticsOrg");
  if (org) org.textContent = details.selectedOrganizationName || organizationName(details.selectedOrganization);
  await loadAnalyticsDashboard();
}

function analyticsQuery() {
  const form = document.querySelector("[data-analytics-filters]");
  const params = new URLSearchParams();
  if (!form) return params;
  const data = new FormData(form);
  for (const key of ["range", "from", "to", "mediaType", "sortBy"]) {
    const value = String(data.get(key) || "").trim();
    if (value) params.set(key, value);
  }
  return params;
}

async function loadAnalyticsDashboard() {
  const query = analyticsQuery().toString();
  const suffix = query ? `?${query}` : "";
  setAnalyticsLoading();
  const [summary, timeseries, topPosts, media, hashtags, insights, recommendations] = await Promise.all([
    api(`/dashboard/summary${suffix}`),
    api(`/dashboard/timeseries${suffix}`),
    api(`/dashboard/top-posts${suffix}`),
    api(`/dashboard/media-performance${suffix}`),
    api(`/dashboard/hashtag-performance${suffix}`),
    api(`/dashboard/insights${suffix}`),
    api(`/dashboard/recommendations${suffix}`)
  ]);
  if (!summary.connected || !summary.totals.posts) {
    renderAnalyticsEmpty(summary);
  } else {
    document.querySelector("#analyticsEmpty").hidden = true;
  }
  renderPlanCard(summary.plan);
  renderAnalyticsOverview(summary);
  renderAnalyticsInsights(insights.insights || [], media, summary);
  renderBestTimePanel(media, summary);
  renderRecommendations("#analyticsRecommendations", recommendations.recommendations || []);
  renderLineChart("#reachChart", timeseries.timeseries || [], "reach", "Reach");
  renderLineChart("#engagementChart", timeseries.timeseries || [], "engagement", "Engagement");
  renderPostsTable("#topPostsTable", topPosts.byImpressions || []);
}

function setAnalyticsLoading() {
  const loading = `<p class="empty-state">Loading analytics.</p>`;
  ["#analyticsOverview", "#analyticsInsights", "#bestTimePanel", "#analyticsRecommendations", "#reachChart", "#engagementChart", "#topPostsTable"].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.innerHTML = loading;
  });
}

function renderBestTimePanel(media = {}, summary = {}) {
  const target = document.querySelector("#bestTimePanel");
  if (!target) return;
  const days = media.postingDays || [];
  const hours = media.postingHours || [];
  const bestDay = days[0];
  const bestHour = hours[0];
  const postCount = Number(summary.totals?.posts || summary.trackedPosts || 0);
  const confidence = postCount >= 25 ? "High" : postCount >= 8 ? "Medium" : "Early";
  if (!bestDay && !bestHour) {
    target.innerHTML = `<p class="empty-state">Sync more posts to identify reliable posting windows.</p>`;
    return;
  }
  target.innerHTML = `
    <div class="best-time-grid">
      ${BestTimeCard("Best day", bestDay?.key || "More data needed", bestDay ? `${formatPercent(bestDay.engagementRate)} engagement rate across ${bestDay.posts} posts` : "Sync more posts")}
      ${BestTimeCard("Best hour", bestHour?.key || "More data needed", bestHour ? `${formatPercent(bestHour.engagementRate)} engagement rate across ${bestHour.posts} posts` : "Sync more posts")}
      ${BestTimeCard("Confidence", confidence, `${postCount.toLocaleString()} synced posts in this view`)}
    </div>
    <p class="best-time-note">${escapeHtml(bestDay && bestHour ? `Try publishing your next post on ${bestDay.key} near ${bestHour.key}, then compare results after the next sync.` : "Metrillix will refine this recommendation as more posts are synced.")}</p>
  `;
}

function BestTimeCard(label, value, detail) {
  return `
    <article class="best-time-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderAnalyticsEmpty(summary = {}) {
  const empty = document.querySelector("#analyticsEmpty");
  if (empty) empty.hidden = false;
  renderPlanCard(summary.plan);
}

function renderPlanCard(plan = {}) {
  const card = document.querySelector("#analyticsPlanCard");
  if (!card) return;
  const note = plan.trialActive ? `${plan.trialDaysRemaining} trial days left` : `${plan.rangeLimitDays || 30}-day analytics`;
  card.innerHTML = `<span>Plan</span><strong>${escapeHtml(plan.label || "Free trial")}</strong><small>${escapeHtml(note)}</small>`;
}

function renderAnalyticsOverview(summary) {
  const target = document.querySelector("#analyticsOverview");
  if (!target) return;
  const totals = summary.totals || {};
  const cards = [
    ["Reach", formatNumber(totals.impressions), summary.deltas?.impressions],
    ["Engagement", formatNumber(totals.engagement), summary.deltas?.engagement],
    ["Avg Engagement", formatPercent(totals.engagementRate), summary.deltas?.engagementRate],
    ["Rate", totals.clickThroughRate === null ? "No clicks" : formatPercent(totals.clickThroughRate), null],
    ["Posts", formatNumber(totals.posts), summary.deltas?.posts],
    ["Follower Growth", formatNumber(totals.followerGrowth), null]
  ];
  target.innerHTML = cards.map(([label, value, delta]) => `
    <article class="analytics-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${delta === null || delta === undefined ? "" : `<small class="${Number(delta) >= 0 ? "positive" : "negative"}">${Number(delta) >= 0 ? "+" : ""}${formatPercent(delta)} vs previous</small>`}
    </article>
  `).join("");
}

function renderAnalyticsInsights(insights, media = {}, summary = {}) {
  const target = document.querySelector("#analyticsInsights");
  if (!target) return;
  const bestDay = (media.postingDays || [])[0];
  const bestHour = (media.postingHours || [])[0];
  const bestPost = summary.bestPost;
  const cards = [
    ["Best Day", bestDay ? bestDay.key : "Not enough data", bestDay ? `${formatPercent(bestDay.engagementRate)} engagement rate` : "Sync more posts"],
    ["Best Hour", bestHour ? bestHour.key : "Not enough data", bestHour ? `${formatPercent(bestHour.engagementRate)} engagement rate` : "Sync more posts"],
    ["Best Post", bestPost ? truncateText(bestPost.text, 58) : "No post yet", bestPost ? `${formatNumber(bestPost.impressions)} reach / ${formatPercent(bestPost.engagementRate)} rate` : "Sync LinkedIn"]
  ];
  target.innerHTML = cards.map(([title, value, detail]) => `
    <article class="insight-card compact">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `).join("");
}

function renderRecommendations(selector, recommendations) {
  const target = document.querySelector(selector);
  if (!target) return;
  if (!recommendations.length) {
    target.innerHTML = `<p class="empty-state">Sync more LinkedIn posts to generate recommendations.</p>`;
    return;
  }
  target.innerHTML = recommendations.map((item) => `
    <article class="decision-card">
      <div>
        <span>${escapeHtml(uiTitleCase(item.category || "decision"))} / ${escapeHtml(item.confidence || "early")} confidence</span>
        <strong>${escapeHtml(item.title || "Recommendation")}</strong>
        <p>${escapeHtml(item.action || "")}</p>
      </div>
      <small>${escapeHtml(item.reason || "")}</small>
    </article>
  `).join("");
}

async function generateAiStrategy(button) {
  const target = document.querySelector("#aiStrategyResult");
  if (!target) return;
  target.hidden = false;
  target.innerHTML = `<p class="empty-state">Generating AI strategy.</p>`;
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Generating";
  try {
    const query = analyticsQuery().toString();
    const suffix = query ? `?${query}` : "";
    const result = await api(`/dashboard/ai-recommendations${suffix}`, { method: "POST" });
    target.innerHTML = AiStrategyResult(result.strategy);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function scoreCurrentDraft(button) {
  const form = document.querySelector("[data-draft-form]");
  const target = document.querySelector("#draftScoreResult");
  if (!form || !target) return;
  const data = new FormData(form);
  const payload = {
    title: data.get("title"),
    topic: data.get("topic"),
    body: data.get("body")
  };
  target.hidden = false;
  target.innerHTML = `<p class="empty-state">Scoring draft with AI.</p>`;
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Scoring";
  try {
    const result = await api("/api/drafts/score", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    target.innerHTML = AiDraftScoreResult(result.score);
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function AiStrategyResult(strategy = {}) {
  const brief = strategy.next_post_brief || {};
  return `
    <article class="ai-card">
      <div>
        <span>AI strategy</span>
        <strong>${escapeHtml(strategy.headline || "Recommended strategy")}</strong>
        <p>${escapeHtml(strategy.recommendation || "Use the recommendations above as your next content direction.")}</p>
      </div>
      ${AiBulletGroup("Why", strategy.why)}
      <div class="ai-brief-grid">
        ${AiBriefItem("Format", brief.format)}
        ${AiBriefItem("Timing", brief.timing)}
        ${AiBriefItem("Topic angle", brief.topic_angle)}
        ${AiBriefItem("CTA", brief.cta)}
      </div>
      ${brief.hook ? `<p class="ai-hook"><strong>Hook:</strong> ${escapeHtml(brief.hook)}</p>` : ""}
      ${Array.isArray(brief.hashtags) && brief.hashtags.length ? `<p class="ai-hook"><strong>Hashtags:</strong> ${escapeHtml(brief.hashtags.join(", "))}</p>` : ""}
      ${AiBulletGroup("Risks", strategy.risks)}
      <small>${escapeHtml(strategy.confidence || "early")} confidence</small>
    </article>
  `;
}

function AiDraftScoreResult(score = {}) {
  return `
    <article class="ai-card">
      <div>
        <span>AI draft score</span>
        <strong>${escapeHtml(score.score ?? "Not scored")}/100</strong>
        <p>${escapeHtml(score.verdict || "Draft reviewed against workspace history.")}</p>
      </div>
      ${AiBulletGroup("Strengths", score.strengths)}
      ${AiBulletGroup("Improve before publishing", score.improvements)}
      ${score.suggested_revision ? `<div class="ai-revision"><strong>Suggested revision</strong><p>${escapeHtml(score.suggested_revision)}</p></div>` : ""}
      ${score.recommended_timing ? `<p class="ai-hook"><strong>Timing:</strong> ${escapeHtml(score.recommended_timing)}</p>` : ""}
      <small>${escapeHtml(score.confidence || "early")} confidence</small>
    </article>
  `;
}

function AiBulletGroup(title, items) {
  const values = Array.isArray(items) ? items.filter(Boolean).slice(0, 5) : [];
  if (!values.length) return "";
  return `
    <div class="ai-list">
      <strong>${escapeHtml(title)}</strong>
      <ul>${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function AiBriefItem(label, value) {
  if (!value) return "";
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderLineChart(selector, rows, key, label, options = {}) {
  const target = document.querySelector(selector);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="empty-chart" aria-hidden="true"></div>`;
    return;
  }
  const values = rows.map((row) => Number(row[key] || 0));
  const max = Math.max(...values, 1);
  const width = 640;
  const height = 260;
  const plotted = rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width;
    const y = height - ((Number(row[key] || 0) / max) * (height - 18)) - 9;
    return { x, y, value: Number(row[key] || 0) };
  });
  const linePoints = rows.length === 1
    ? `18,${plotted[0].y.toFixed(1)} ${width - 18},${plotted[0].y.toFixed(1)}`
    : plotted.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const circles = plotted.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="7"></circle>`).join("");
  target.innerHTML = `
    <div class="line-chart">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(label)} chart">
        <polyline points="${linePoints}" fill="none" stroke="var(--blue-dark)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
        <g fill="var(--white)" stroke="var(--blue-dark)" stroke-width="4">${circles}</g>
      </svg>
      <div class="chart-axis">
        <span>${escapeHtml(rows[0].date || "")}</span>
        <strong>${escapeHtml(formatChartValue(max, options))}</strong>
        <span>${escapeHtml(rows[rows.length - 1].date || "")}</span>
      </div>
    </div>
  `;
}

function renderBarChart(selector, rows, labelKey, valueKey, options = {}) {
  const target = document.querySelector(selector);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="empty-chart" aria-hidden="true"></div>`;
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  target.innerHTML = `<div class="bar-chart">${rows.slice(0, 10).map((row) => {
    const value = Number(row[valueKey] || 0);
    return `
      <div class="bar-row">
        <span>${escapeHtml(row[labelKey] || "Unknown")}</span>
        <div><i style="width:${Math.max(4, (value / max) * 100).toFixed(1)}%"></i></div>
        <strong>${escapeHtml(formatChartValue(value, options))}</strong>
      </div>
    `;
  }).join("")}</div>`;
}

function renderPostsTable(selector, posts) {
  const target = document.querySelector(selector);
  if (!target) return;
  if (!posts.length) {
    target.innerHTML = `<p class="empty-state">No posts in this view.</p>`;
    return;
  }
  target.innerHTML = `
    <div class="analytics-table-wrap">
      <table class="analytics-table">
        <thead><tr><th>Post</th><th>Reach</th><th>Engagement</th><th>Clicks</th></tr></thead>
        <tbody>
          ${posts.map((post) => `
            <tr>
              <td><a href="${escapeAttribute(post.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(truncateText(post.text || post.postId, 68))}</a><small>${escapeHtml(formatDateTime(post.createdAt))}</small></td>
              <td>${formatNumber(post.impressions)}</td>
              <td>${formatNumber(post.engagement)}</td>
              <td>${formatNumber(post.clicks)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHashtagTable(selector, hashtags) {
  const target = document.querySelector(selector);
  if (!target) return;
  if (!hashtags.length) {
    target.innerHTML = `<p class="empty-state">No hashtags found in synced posts.</p>`;
    return;
  }
  target.innerHTML = `
    <div class="analytics-table-wrap">
      <table class="analytics-table">
        <thead><tr><th>Hashtag</th><th>Posts</th><th>Impressions</th><th>Engagement</th><th>Rate</th><th>Clicks</th></tr></thead>
        <tbody>
          ${hashtags.map((tag) => `
            <tr>
              <td><strong>${escapeHtml(tag.hashtag)}</strong></td>
              <td>${formatNumber(tag.posts)}</td>
              <td>${formatNumber(tag.impressions)}</td>
              <td>${formatNumber(tag.engagement)}</td>
              <td>${formatPercent(tag.engagementRate)}</td>
              <td>${formatNumber(tag.clicks)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function hydrateAdminAccounts() {
  const target = document.querySelector("#adminAccounts");
  if (!target) return;
  target.innerHTML = `<p class="empty-state">Loading accounts.</p>`;
  try {
    const result = await api("/api/admin/accounts");
    renderAdminSummary(result);
    renderAdminAccounts(result.accounts || []);
  } catch (error) {
    target.innerHTML = `
      <div class="admin-access-panel">
        <h2>Admin access unavailable</h2>
        <p>${escapeHtml(userMessage(error, "Log in with an email listed in ADMIN_EMAILS to view registered users."))}</p>
        <div class="button-row">
          <button class="primary-button" data-route="/login">Log in</button>
          <button class="secondary-button" data-route="/">Main site</button>
        </div>
      </div>
    `;
  }
}

function renderAdminSummary(result = {}) {
  const target = document.querySelector("#adminSummary");
  if (!target) return;
  const accounts = result.accounts || [];
  const connected = accounts.filter((account) => account.linkedin?.connected).length;
  target.innerHTML = [
    ["Total accounts", formatNumber(result.total || accounts.length)],
    ["Admins", formatNumber(result.admins || 0)],
    ["LinkedIn connected", formatNumber(connected)]
  ].map(([label, value]) => `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderAdminAccounts(accounts) {
  const target = document.querySelector("#adminAccounts");
  if (!target) return;
  if (!accounts.length) {
    target.innerHTML = `<p class="empty-state">No registered accounts yet.</p>`;
    return;
  }

  target.innerHTML = `
    <div class="analytics-table-wrap">
      <table class="analytics-table admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Plan</th>
            <th>Billing</th>
            <th>LinkedIn</th>
            <th>Last Login</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          ${accounts.map((account) => `
            <tr>
              <td>
                <strong>${escapeHtml(account.name || "Unnamed user")}</strong>
                <small>${escapeHtml(account.email || "")}${account.isAdmin ? " - Admin" : ""}</small>
              </td>
              <td>${escapeHtml(account.plan || "Free trial")}</td>
              <td>
                ${escapeHtml(uiTitleCase(account.billingStatus || "inactive"))}
                <small>${account.stripeCustomerId ? "Stripe customer" : "No Stripe customer"}</small>
              </td>
              <td>
                ${account.linkedin?.connected ? "Connected" : "Not connected"}
                <small>${formatNumber(account.linkedin?.organizationCount || 0)} page${Number(account.linkedin?.organizationCount || 0) === 1 ? "" : "s"}</small>
              </td>
              <td>
                ${escapeHtml(account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Never")}
                <small>${formatNumber(account.loginCount || 0)} login${Number(account.loginCount || 0) === 1 ? "" : "s"}</small>
              </td>
              <td>${escapeHtml(formatDateTime(account.createdAt))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function formatPercent(value) {
  const number = Number(value || 0);
  return `${number.toFixed(Math.abs(number) >= 10 ? 0 : 1)}%`;
}

function formatChartValue(value, options = {}) {
  return options.percent ? formatPercent(value) : formatNumber(value);
}

function truncateText(value, length) {
  const text = String(value || "Untitled post").trim();
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
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
  renderContentScore();
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
    list.innerHTML = `<p class="empty-state">${escapeHtml(userMessage(error, "Unable to load drafts."))}</p>`;
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
        <button class="secondary-button" type="button" data-copy-draft="${escapeAttribute(draft.id)}">Copy text</button>
        ${draft.figure?.dataUrl ? `<button class="secondary-button" type="button" data-download-figure="${escapeAttribute(draft.id)}">Download image</button>` : ""}
        <a class="secondary-button" href="https://www.linkedin.com/feed/" target="_blank" rel="noreferrer">Open LinkedIn</a>
        ${draft.status === "published" ? "" : `<button class="primary-button" type="button" data-publish-draft="${escapeAttribute(draft.id)}">Publish</button>`}
        ${draft.status === "published" ? "" : `<button class="secondary-button" type="button" data-mark-manual-draft="${escapeAttribute(draft.id)}">Mark published</button>`}
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
  renderContentScore();
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
  renderContentScore();
}

async function findDraftById(draftId) {
  const localDraft = loadLocalDrafts().find((draft) => draft.id === draftId);
  if (localDraft) return { draft: localDraft, local: true, drafts: loadLocalDrafts() };
  const result = await api("/api/drafts");
  const draft = (result.drafts || []).find((item) => item.id === draftId);
  if (!draft) throw new Error("Draft not found");
  return { draft, drafts: result.drafts || [] };
}

async function copyDraftText(draftId) {
  const { draft } = await findDraftById(draftId);
  const text = [draft.topic, draft.body].filter(Boolean).join("\n\n").trim();
  if (!text) throw new Error("This draft has no text to copy.");
  await navigator.clipboard.writeText(text);
  showToast("Draft text copied");
}

async function downloadDraftFigure(draftId) {
  const { draft } = await findDraftById(draftId);
  if (!draft.figure?.dataUrl) throw new Error("This draft has no image.");
  const link = document.createElement("a");
  link.href = draft.figure.dataUrl;
  link.download = draft.figure.name || "metrillix-draft-image.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("Image download started");
}

async function markDraftPublishedManually(draftId) {
  let result;
  try {
    result = await api(`/api/drafts/${encodeURIComponent(draftId)}/manual-publish`, { method: "POST" });
  } catch (error) {
    if (!isMissingDraftApi(error)) throw error;
    result = markLocalDraftPublished(draftId, { manual: true });
  }
  document.querySelector("#draftList").innerHTML = DraftList(result.drafts || loadLocalDrafts());
  showToast("Draft marked as published");
}

function renderContentScore() {
  const form = document.querySelector("[data-draft-form]");
  const value = document.querySelector("#contentScoreValue");
  const target = document.querySelector("#contentScoreResult");
  if (!form || !value || !target) return;
  const data = new FormData(form);
  const score = scoreDraftContent({
    title: data.get("title"),
    topic: data.get("topic"),
    body: data.get("body"),
    figure: currentDraftFigure
  });
  value.textContent = `${score.score}/100`;
  target.innerHTML = `
    <div class="score-meter" aria-label="Content score ${score.score} out of 100">
      <span style="width: ${score.score}%"></span>
    </div>
    <p>${escapeHtml(score.verdict)}</p>
    <div class="score-checklist">
      ${score.checks.map((check) => `
        <span class="${check.pass ? "pass" : ""}">${check.pass ? "OK" : "-"} ${escapeHtml(check.label)}</span>
      `).join("")}
    </div>
  `;
}

function scoreDraftContent(draft = {}) {
  const body = String(draft.body || "").trim();
  const topic = String(draft.topic || "").trim();
  const words = body ? body.split(/\s+/).filter(Boolean).length : 0;
  const lines = body.split(/\n+/).filter((line) => line.trim()).length;
  const checks = [
    { label: "Clear draft text", pass: words >= 20, points: 18 },
    { label: "Focused topic", pass: topic.length >= 8, points: 12 },
    { label: "Strong opening line", pass: firstMeaningfulLine(body).length >= 18, points: 14 },
    { label: "Readable length", pass: words >= 45 && words <= 220, points: 16 },
    { label: "Uses line breaks", pass: lines >= 3, points: 10 },
    { label: "Has a clear CTA or question", pass: /(\?|comment|share|tell me|what do you think|try|start|learn|join|book|download)/i.test(body), points: 14 },
    { label: "Has visual support", pass: Boolean(draft.figure?.dataUrl), points: 8 },
    { label: "Hashtag count is controlled", pass: hashtagCount(body) <= 5, points: 8 }
  ];
  const score = checks.reduce((sum, check) => sum + (check.pass ? check.points : 0), 0);
  const verdict = score >= 82
    ? "Ready to publish. The draft is clear, structured, and action-oriented."
    : score >= 58
      ? "Close. Improve the missing checklist items before publishing."
      : "Early draft. Add structure, a clear hook, and a stronger next action.";
  return { score, verdict, checks };
}

function firstMeaningfulLine(text) {
  return String(text || "").split(/\n+/).map((line) => line.trim()).find(Boolean) || "";
}

function hashtagCount(text) {
  return (String(text || "").match(/#[\p{L}\p{N}_]+/gu) || []).length;
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
  try {
    if (localDraft) {
      result = await api("/api/linkedin/publish", {
        method: "POST",
        body: JSON.stringify(localDraft)
      });
      result = markLocalDraftPublished(draftId, result.published);
    } else {
      result = await api(`/api/drafts/${encodeURIComponent(draftId)}/publish`, { method: "POST" });
    }
  } catch (error) {
    if (isMissingDraftApi(error)) throw new Error("This feature is still being updated. Please try again shortly.");
    throw error;
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
    const [state, recommendationResult] = await Promise.all([
      dashboardState || loadDashboardState(),
      api("/dashboard/recommendations?range=90").catch(() => ({ recommendations: [] }))
    ]);
    const posts = state.postRankings || state.posts || [];
    list.innerHTML = PageInspirationResults(posts, recommendationResult.recommendations || []);
  } catch (error) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(userMessage(error, "Unable to load page signals."))}</p>`;
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
    list.innerHTML = `<p class="empty-state">${escapeHtml(userMessage(error, "LinkedIn Ad Library unavailable."))}</p>`;
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

function PageInspirationResults(posts, recommendations = []) {
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
      ${recommendations.length ? `
        <section class="ad-insight-group">
          <h3>Recommended next moves</h3>
          <div class="decision-list compact">
            ${recommendations.slice(0, 3).map((item) => `
              <article class="decision-card">
                <div>
                  <span>${escapeHtml(uiTitleCase(item.category || "decision"))} / ${escapeHtml(item.confidence || "early")} confidence</span>
                  <strong>${escapeHtml(item.title || "Recommendation")}</strong>
                  <p>${escapeHtml(item.action || "")}</p>
                </div>
                <small>${escapeHtml(item.reason || "")}</small>
              </article>
            `).join("")}
          </div>
        </section>
      ` : ""}
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
  const first = formatAdDate(ad.firstImpressionDate);
  const latest = formatAdDate(ad.latestImpressionDate);
  if (first && latest && first !== latest) return `${first} - ${latest}`;
  if (first || latest) return first || latest;
  return "Impression dates unavailable";
}

function formatAdDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function impressionRange(ad) {
  const from = ad.impressionsFrom === null || ad.impressionsFrom === undefined ? null : Number(ad.impressionsFrom).toLocaleString();
  const to = ad.impressionsTo === null || ad.impressionsTo === undefined ? null : Number(ad.impressionsTo).toLocaleString();
  if (from && to) return `${from} - ${to} impressions`;
  if (from) return `${from}+ impressions`;
  return "Impression range unavailable";
}

function SyncStatusPanel(sync, summary = {}) {
  const diagnostics = sync?.diagnostics || {};
  const metricCoverage = [
    `${diagnostics.postsWithReach || 0} reach`,
    `${diagnostics.postsWithEngagements || 0} engagement`,
    `${diagnostics.postsWithClicks || 0} clicks`
  ].join(" / ");

  if (sync?.status === "failed") {
    return `
      <div class="sync-health-item">
        <span>Last sync</span>
        <strong>Sync failed</strong>
      </div>
      <div class="sync-health-item">
        <span>Posts tracked</span>
        <strong>${Number(summary.trackedPosts || 0).toLocaleString()}</strong>
      </div>
      <div class="sync-health-item sync-health-message">
        <span>Metric coverage</span>
        <strong>${escapeHtml(userMessage(sync.lastError || "LinkedIn sync failed.", "LinkedIn sync failed."))}</strong>
      </div>
    `;
  }

  if (!sync?.lastIngestedAt) {
    return `
      <div class="sync-health-item">
        <span>Last sync</span>
        <strong>Not synced yet</strong>
      </div>
      <div class="sync-health-item">
        <span>Posts tracked</span>
        <strong>${Number(summary.trackedPosts || 0).toLocaleString()}</strong>
      </div>
      <div class="sync-health-item">
        <span>Metric coverage</span>
        <strong>Waiting for sync</strong>
      </div>
    `;
  }

  return `
    <div class="sync-health-item">
      <span>Last sync</span>
      <strong>${formatDateTime(sync.lastIngestedAt)}</strong>
    </div>
    <div class="sync-health-item">
      <span>Posts tracked</span>
      <strong>${Number(summary.trackedPosts || 0).toLocaleString()}</strong>
    </div>
    <div class="sync-health-item">
      <span>Metric coverage</span>
      <strong>${escapeHtml(metricCoverage)}</strong>
    </div>
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
        showError(error);
      }
    });
  });

  document.querySelectorAll("[data-password-forgot]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await requestPasswordReset(form);
      } catch (error) {
        showError(error);
      }
    });
  });

  document.querySelectorAll("[data-password-reset]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await submitPasswordReset(form);
      } catch (error) {
        showError(error);
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
    form.addEventListener("input", renderContentScore);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveDraft(form);
      } catch (error) {
        showError(error, "Unable to save draft.");
      }
    });
  });

  document.querySelectorAll("[data-generate-ai-strategy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await generateAiStrategy(button);
      } catch (error) {
        const target = document.querySelector("#aiStrategyResult");
        if (target) {
          target.hidden = false;
          target.innerHTML = `<p class="empty-state">${escapeHtml(userMessage(error, "AI strategy is unavailable right now."))}</p>`;
        }
      }
    });
  });

  document.querySelectorAll("[data-score-draft]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await scoreCurrentDraft(button);
      } catch (error) {
        const target = document.querySelector("#draftScoreResult");
        if (target) {
          target.hidden = false;
          target.innerHTML = `<p class="empty-state">${escapeHtml(userMessage(error, "Draft feedback is unavailable right now."))}</p>`;
        }
      }
    });
  });

  document.querySelectorAll("[data-admin-refresh]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await hydrateAdminAccounts();
      } catch (error) {
        showError(error, "Unable to refresh admin accounts.");
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-billing-checkout]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await startBillingCheckout(button.dataset.billingCheckout || "growth");
      } catch (error) {
        showError(error, "Unable to start Stripe checkout.");
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-billing-portal]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await openBillingPortal();
      } catch (error) {
        showError(error, "Billing portal is not available yet.");
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-draft-figure]").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        currentDraftFigure = await readDraftFigure(input.files?.[0]);
        renderDraftFigurePreview();
        renderContentScore();
      } catch (error) {
        input.value = "";
        showError(error, "Unable to attach that image.");
      }
    });
  });

  document.querySelectorAll("[data-analytics-filters]").forEach((form) => {
    form.addEventListener("change", () => {
      const custom = form.elements.range?.value === "custom";
      form.elements.from.disabled = !custom;
      form.elements.to.disabled = !custom;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await loadAnalyticsDashboard();
      } catch (error) {
        showError(error, "Unable to load analytics.");
      }
    });
    const custom = form.elements.range?.value === "custom";
    form.elements.from.disabled = !custom;
    form.elements.to.disabled = !custom;
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

function uiTitleCase(value) {
  return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function userMessage(error, fallback = "Something went wrong. Please try again.") {
  const raw = typeof error === "string" ? error : error?.message;
  const message = String(raw || "").trim();
  const lower = message.toLowerCase();
  const status = Number(error?.status || 0);

  if (!message) return fallback;
  if (/invalid email or password|wrong username|wrong password|invalid credentials/.test(lower)) {
    return "Invalid email or password.";
  }
  if (/publishing permission|posting access|organization posting|publishing unavailable|image publishing unavailable/.test(lower)) {
    return message;
  }
  if (status === 401 || /oauth token missing|reconnect linkedin|unauthorized|token.*expired|invalid token/.test(lower)) {
    return "Please reconnect LinkedIn, then try again.";
  }
  if (status === 403 || /forbidden|permission|access denied|not enough permissions|scope/.test(lower)) {
    return "This LinkedIn page does not allow that action yet. Reconnect LinkedIn and confirm the selected page has the right permissions.";
  }
  if (/api route not found|route not found|worker api|publishing backend|backend is not deployed|not deployed/.test(lower)) {
    return "This feature is still being updated. Please try again shortly.";
  }
  if (/multiple errors occurred|field value validation failed|param validation|parameter|data processing exception|restli|ugc posts api|social actions api|analytics api|organization lookup|linkedin .*api/.test(lower)) {
    return "LinkedIn could not complete this request. Reconnect LinkedIn or choose another company page, then try again.";
  }
  if (/organization selection required|select a linkedin page|missing linkedin organization|organization is not available/.test(lower)) {
    return "Select a LinkedIn company page before continuing.";
  }
  if (/ad library access unavailable/.test(lower)) {
    return "LinkedIn Ad Library access is unavailable for this account.";
  }
  if (/ai recommendations are not configured|openai|ai .*unavailable|ai returned/.test(lower)) {
    return "AI recommendations are not configured yet. Add the AI API key and try again.";
  }
  if (status === 404) {
    return "This feature is not available yet. Please refresh and try again shortly.";
  }
  if (status === 429 || /rate limit|too many requests/.test(lower)) {
    return "Too many requests right now. Please wait a minute and try again.";
  }
  if (status >= 500 || /request failed|server error|internal error|exception|stack|trace|fetch failed|networkerror|failed to fetch/.test(lower)) {
    return fallback;
  }
  if (status >= 400 && /json|syntax|undefined|null|object object|bad request|invalid request/.test(lower)) {
    return fallback;
  }
  return message;
}

async function handleAppClick(event) {
  if (event.target.closest("[data-theme-toggle]")) {
    event.preventDefault();
    toggleTheme();
    return;
  }

  if (event.target.closest("[data-accept-cookies]")) {
    localStorage.setItem(cookieConsentKey, "accepted");
    renderCookieBanner();
    return;
  }

  const backTarget = event.target.closest("[data-back]");
  if (backTarget) {
    event.preventDefault();
    navigateBack(backTarget.dataset.backFallback || "/");
    return;
  }

  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget) {
    event.preventDefault();
    if (routeTarget.closest("[data-brand-home]") && hasActiveSession() && window.location.pathname !== "/") {
      const confirmed = window.confirm("Do you want to leave your dashboard and go to the public homepage?");
      if (!confirmed) return;
    }
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
        if (window.location.pathname === "/dashboard/analytics") {
          await hydrateAnalyticsDashboard();
        } else {
          await hydrateDashboard(result.state);
        }
      } else {
        if (window.location.pathname === "/dashboard/analytics") {
          await hydrateAnalyticsDashboard();
        } else {
          await hydrateDashboard();
        }
      }
      showToast(`LinkedIn synced: ${result.saved || 0} posts saved`);
    } catch (error) {
      if (window.location.pathname === "/dashboard/analytics") {
        await hydrateAnalyticsDashboard().catch(() => {});
      } else {
        await hydrateDashboard().catch(() => {});
      }
      showError(error, "Unable to sync LinkedIn right now.");
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
      showError(error, "Unable to disconnect LinkedIn right now.");
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
    renderContentScore();
    return;
  }

  const copyDraftTarget = event.target.closest("[data-copy-draft]");
  if (copyDraftTarget) {
    try {
      await copyDraftText(copyDraftTarget.dataset.copyDraft);
    } catch (error) {
      showError(error, "Unable to copy this draft.");
    }
    return;
  }

  const downloadFigureTarget = event.target.closest("[data-download-figure]");
  if (downloadFigureTarget) {
    try {
      await downloadDraftFigure(downloadFigureTarget.dataset.downloadFigure);
    } catch (error) {
      showError(error, "Unable to download this image.");
    }
    return;
  }

  const markManualTarget = event.target.closest("[data-mark-manual-draft]");
  if (markManualTarget) {
    try {
      await markDraftPublishedManually(markManualTarget.dataset.markManualDraft);
    } catch (error) {
      showError(error, "Unable to mark this draft as published.");
    }
    return;
  }

  if (event.target.closest("[data-copy-weekly-snapshot]")) {
    try {
      await copyWeeklySnapshot();
    } catch (error) {
      showError(error, "Unable to copy weekly snapshot.");
    }
    return;
  }

  const sendSnapshotTarget = event.target.closest("[data-send-weekly-snapshot]");
  if (sendSnapshotTarget) {
    try {
      await sendWeeklySnapshot(sendSnapshotTarget);
    } catch (error) {
      showError(error, "Unable to send weekly snapshot.");
    }
    return;
  }

  const createShareTarget = event.target.closest("[data-create-share-report]");
  if (createShareTarget) {
    try {
      await createShareReport(createShareTarget);
    } catch (error) {
      showError(error, "Unable to create share report.");
    }
    return;
  }

  if (event.target.closest("[data-download-report-pdf]")) {
    downloadSharedReportPdf();
    return;
  }

  if (event.target.closest("[data-copy-report-link]")) {
    try {
      await copyCurrentReportLink();
    } catch (error) {
      showError(error, "Unable to copy report link.");
    }
    return;
  }

  const editDraftTarget = event.target.closest("[data-edit-draft]");
  if (editDraftTarget) {
    try {
      await editDraft(editDraftTarget.dataset.editDraft);
    } catch (error) {
      showError(error, "Unable to open this draft.");
    }
    return;
  }

  const deleteDraftTarget = event.target.closest("[data-delete-draft]");
  if (deleteDraftTarget) {
    try {
      await deleteDraft(deleteDraftTarget.dataset.deleteDraft);
    } catch (error) {
      showError(error, "Unable to delete this draft.");
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
      showError(error, "Unable to publish this draft.");
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
      showError(error, "Unable to select this LinkedIn page.");
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
      showError(error, "Unable to update this page name.");
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
  applyTheme();
  const path = window.location.pathname;
  const route = routes[path] ? path : path.startsWith("/share/report/") ? "/share/report" : "/";
  setPageMeta(route);
  document.body.dataset.page = route === "/" ? "home" : route === "/share/report" ? "shared-report" : "app";
  const isPrivate = route.startsWith("/dashboard") || route === "/create-post" || route === "/admin";
  document.body.dataset.publicPage = String(!isPrivate);

  if (isPrivate && !session.email && !session.accountId) {
    window.history.replaceState({}, "", "/login");
    document.body.dataset.page = "app";
    document.body.dataset.publicPage = "true";
    app.innerHTML = LoginPage();
    applyTheme();
    wirePageEvents();
    return;
  }

  app.innerHTML = routes[route]();
  applyTheme();

  wirePageEvents();
  if (window.location.hash && !isPrivate) {
    window.requestAnimationFrame(() => scrollToSection(window.location.hash.slice(1)));
  }

  try {
    if (route === "/dashboard/onboarding") await hydrateOnboarding();
    if (route === "/dashboard") await hydrateDashboard();
    if (route === "/dashboard/analytics") await hydrateAnalyticsDashboard();
    if (route === "/create-post") await hydrateCreatePost();
    if (route === "/share/report") await hydrateSharedReport();
    if (route === "/admin") await hydrateAdminAccounts();
  } catch (error) {
    showError(error);
  }
  renderCookieBanner();
}

window.addEventListener("popstate", render);
document.addEventListener("click", handleAppClick);
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (!localStorage.getItem(themePreferenceKey)) applyTheme(systemTheme());
});
applyTheme();
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
