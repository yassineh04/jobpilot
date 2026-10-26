// Accessibility audit (axe-core, WCAG 2.1 A/AA) of every page, logged in as the demo user.
// Fails on "serious" or "critical" violations. Usage: npm run a11y (THEME=dark to audit the dark theme)
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const BASE = process.env.BASE || "http://localhost:4300";
const THEME = process.env.THEME || "light";
const PAGES = ["/dashboard", "/applications?view=board", "/applications?view=list", "/applications?status=APPLIED", "/agenda",
               "/interviews?tab=practice", "/interviews?tab=questions", "/interviews?tab=weakness", "/contacts",
               "/analytics?tab=pipeline", "/analytics?tab=works", "/analytics?tab=market",
               "/profile", "/profile?tab=skills", "/profile?tab=resumes", "/assistant", "/settings"];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("jp-theme", t); } catch { /* ignore */ } }, THEME);
  const page = await ctx.newPage();
  const report = [];

  const audit = async (label) => {
    await page.waitForTimeout(400);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of result.violations) {
      report.push({ page: label, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
                    sample: v.nodes[0]?.target.join(" ") });
    }
  };

  for (const p of ["/", "/login", "/register"]) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await audit(p);
  }
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', process.env.EMAIL || "alex@jobpilot.dev");
  await page.fill('input[type="password"]', "Demo1234!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  for (const p of PAGES) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await audit(p);
  }
  await page.goto(`${BASE}/applications`, { waitUntil: "networkidle" });
  await page.locator('a[href^="/applications/"]').first().click();
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  await audit("/applications/[id]");
  await page.goto(`${BASE}/applications?new=1`, { waitUntil: "networkidle" });
  await audit("new application dialog");

  // Interactive pieces: bulk selection bar, account menu, shortcuts help, agent panel
  await page.goto(`${BASE}/applications?view=list`, { waitUntil: "networkidle" });
  await page.getByRole("checkbox", { name: /^Select .+ at / }).first().check();
  await audit("bulk actions bar");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /alex|@jobpilot/i }).first().click();
  await audit("account menu");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await audit("shortcuts dialog");
  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  await page.getByRole("complementary", { name: "JobPilot agent" }).waitFor();
  await audit("agent panel");
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Import from CV" }).click();
  await page.getByRole("dialog", { name: "Import from your CV" }).waitFor();
  await audit("CV import dialog");

  const blocking = report.filter((r) => ["serious", "critical"].includes(r.impact));
  for (const r of report) console.log(`${r.impact.padEnd(8)} ${r.page.padEnd(28)} ${r.id} (${r.nodes}) ${r.help} :: ${r.sample}`);
  console.log(`\n${report.length} issue groups, ${blocking.length} serious/critical, across ${PAGES.length + 10} views (${THEME} theme).`);
  await browser.close();
  process.exitCode = blocking.length ? 1 : 0;
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
