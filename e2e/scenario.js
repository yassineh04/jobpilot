// End-to-end scenario on the empty demo account (run `python -m app.seed` first, it resets it).
// Covers: auth, onboarding, profile, CV import from a real PDF, posting extraction, application page (fit,
// CV keywords, brief, draft, interviews, history), agenda, interview practice with AI feedback, question
// bank, contacts, board drag & drop with undo, dashboard debrief, analytics, agent, global search,
// keyboard shortcuts, bulk actions, theme switching, password change and session guard.
// AI steps run only when the API reports AI as enabled.
// Usage: cd e2e && npm install && npx playwright install chromium && npm test
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:4300";
const API = process.env.API || "http://localhost:8300";
const OUT = path.join(__dirname, "shots");
const AI_TIMEOUT = 300_000; // local models on a laptop CPU can take a minute or two
fs.mkdirSync(OUT, { recursive: true });

const POSTING = `Backend Engineer
Company: Northwind Labs
Location: Montreal, QC

We are a remote-first team. Full-time role.

What you'll do
- Improve reliability and performance of our APIs
- Take part in the on-call rotation for the services you own

Requirements
- 3+ years of experience with Python and PostgreSQL
- Experience with Docker and AWS

Nice to have
- Kafka

Salary: $105,000 - $125,000 CAD`;

const CV_HTML = `<html><body style="font-family: Helvetica, Arial; font-size: 11pt; margin: 40px">
<h1>Jordan Lee</h1><p>Software developer, Montreal</p>
<h3>EXPERIENCE</h3><p><b>Developer Intern</b>, Coveo, May 2024 - August 2024</p>
<ul><li>Built an indexing service in Python processing 2M documents per day</li>
<li>Cut PostgreSQL query latency by 35% with partial indexes</li></ul>
<h3>SKILLS</h3><p>Python, PostgreSQL, Docker, React, Git</p>
<h3>LANGUAGES</h3><p>French (native), English (fluent)</p></body></html>`;

(async () => {
  const aiEnabled = (await (await fetch(`${API}/ai/status`)).json()).enabled;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const printer = await context.newPage();  // prints the CV used by the import step
  await printer.setContent(CV_HTML);
  const cvPdf = await printer.pdf({ format: "Letter" });
  await printer.close();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`[http ${r.status()}] ${r.url()}`); });
  let count = 0;
  const step = (name) => console.log(`ok ${++count} - ${name}`);
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`AI ${aiEnabled ? "enabled" : "disabled"}: AI steps ${aiEnabled ? "included" : "skipped"}`);

  // ---- Auth ----
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "new@jobpilot.dev");
  await page.fill('input[type="password"]', "wrong-password");
  await page.click('button[type="submit"]');
  await page.getByText("Invalid email or password").waitFor();
  assert.ok(!page.url().includes("password="), "credentials must never appear in the URL");
  step("wrong password shows an error, credentials stay out of the URL");
  await page.fill('input[type="password"]', "Demo1234!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await page.getByText("Set up your job search").waitFor();
  await page.getByText("0 of 4 done").waitFor();
  step("empty account sees the setup checklist");

  // ---- Profile ----
  await page.goto(`${BASE}/profile?tab=skills`);
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByLabel("Skill", { exact: true }).fill("Python");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Skill added").waitFor();
  step("skill added to profile");
  await page.goto(`${BASE}/profile?tab=resumes`);
  await page.getByRole("button", { name: "New resume" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Backend");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.getByText("Resume added").waitFor();
  step("resume added from the profile");

  // ---- CV import (rules only when AI is off: skills and languages) ----
  await page.goto(`${BASE}/profile`);
  await page.getByRole("button", { name: "Import from CV" }).click();
  const cvDialog = page.getByRole("dialog", { name: "Import from your CV" });
  await cvDialog.locator('input[type="file"]').setInputFiles({ name: "jordan-lee-cv.pdf", mimeType: "application/pdf", buffer: cvPdf });
  const importButton = cvDialog.getByRole("button", { name: /^Import \d+ items?$/ });
  await importButton.waitFor({ timeout: AI_TIMEOUT });
  // Python is already in the profile: it is shown but not selected
  assert.equal(await cvDialog.getByRole("button", { name: "Python", exact: true }).getAttribute("aria-pressed"), "false");
  await importButton.click();
  await cvDialog.getByText(/^Added /).waitFor();
  await cvDialog.getByRole("button", { name: "Done" }).click();
  await page.goto(`${BASE}/profile?tab=resumes`);
  await page.getByText("jordan-lee-cv.pdf").waitFor();
  step(`CV imported from a PDF and kept as a resume (${aiEnabled ? "AI" : "rules"})`);

  // ---- Application from a pasted posting ----
  await page.goto(`${BASE}/applications?new=1`);
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.getByLabel("Job posting", { exact: true }).fill(POSTING);
  await page.getByRole("button", { name: "Extract details" }).click();
  await page.getByText(/^Extracted with/).waitFor({ timeout: AI_TIMEOUT });
  assert.equal(await page.getByLabel("Company", { exact: true }).inputValue(), "Northwind Labs");
  assert.equal(await page.getByLabel("Position", { exact: true }).inputValue(), "Backend Engineer");
  assert.equal(await page.getByLabel("Salary max", { exact: true }).inputValue(), "125000");
  step(`posting extracted into the form (${aiEnabled ? "AI" : "rules"})`);
  await page.getByRole("button", { name: "Add application" }).click();
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
  const appUrl = page.url();
  const appId = appUrl.split("/").pop();
  step("application created, redirected to its page");

  await page.getByRole("tab", { name: "Fit score" }).click();
  await page.getByText("Review before applying").waitFor();
  await page.getByText("Not found in profile").waitFor();
  step("deterministic fit score renders");
  await page.getByText("Keywords in your CV").waitFor();
  await page.getByText(/^3 of 4 required skills appear in your CV$/).waitFor();
  step("posting checked against the words in the CV (AWS missing)");

  await page.getByRole("button", { name: /^Applied\. Move here/ }).click();
  await page.getByText("Moved to Applied").waitFor();
  await page.getByRole("button", { name: /^Applied \(current\)/ }).waitFor();
  await page.getByRole("button", { name: /^Saved \(done\)/ }).waitFor();
  step("status changed to Applied from the progress stepper");

  if (aiEnabled) {
    await page.getByRole("tab", { name: "Brief" }).click();
    await page.getByRole("button", { name: "Generate the brief" }).click();
    await page.getByText("What they care about").waitFor({ timeout: AI_TIMEOUT });
    await page.getByText(/Every quote was checked/).waitFor();
    await shot("e2e_brief");
    step("AI brief generated, quotes verified");

    await page.getByRole("button", { name: "Draft message" }).click();
    await page.getByRole("button", { name: "Write the draft" }).click();
    await page.getByRole("button", { name: "Copy" }).waitFor({ timeout: AI_TIMEOUT });
    assert.ok((await page.getByRole("dialog").getByLabel("Message", { exact: true }).inputValue()).length > 40);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
    step("AI draft message written");
  }

  await page.getByRole("tab", { name: /Interviews/ }).click();
  await page.getByRole("button", { name: "Schedule" }).click();
  const tomorrow = new Date(Date.now() + 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  await page.getByLabel("Date", { exact: true }).fill(tomorrowStr);
  await page.getByLabel(/^Interviewer/).fill("Julie Tremblay");
  await page.getByRole("dialog").getByRole("button", { name: "Schedule" }).click();
  await page.getByText("Interview scheduled").waitFor();
  await page.getByText("with Julie Tremblay").waitFor();
  step("interview scheduled");

  await page.getByRole("tab", { name: "History" }).click();
  await page.getByText("Interview scheduled").first().waitFor();
  step("history shows the recorded events");

  await page.getByLabel("New task", { exact: true }).fill("Send thank-you email");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByText("Send thank-you email").waitFor();
  step("task added from the application page");

  // ---- Agenda ----
  await page.goto(`${BASE}/agenda`);
  await page.getByRole("button", { name: tomorrow.toDateString() }).click();
  await page.getByText("Julie Tremblay").first().waitFor();
  await page.getByLabel("New task", { exact: true }).fill("Prepare system design notes");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByText("Prepare system design notes").waitFor();
  await page.getByRole("button", { name: "Complete task" }).first().click();
  await page.getByText("Task completed").waitFor();
  step("agenda shows the interview, adds and completes tasks");

  // ---- Interview prep ----
  await page.goto(`${BASE}/interviews?tab=questions`);
  await page.getByRole("button", { name: "Record question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Explain database indexing trade-offs");
  await page.getByLabel("My confidence", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Question recorded").waitFor();
  step("interview question recorded");

  if (aiEnabled) {
    await page.goto(`${BASE}/interviews?tab=practice&app=${appId}`);
    await page.getByRole("button", { name: "Generate questions" }).click();
    await page.getByLabel("Your answer", { exact: true }).waitFor({ timeout: AI_TIMEOUT });
    await page.getByLabel("Your answer", { exact: true }).fill(
      "At my internship the leaderboard API was slow. I profiled it, added a Redis cache and an index, " +
      "and p95 latency dropped by 38 percent, which the team kept as the new baseline.");
    await page.getByRole("button", { name: "Get feedback" }).click();
    await page.getByText("What works").waitFor({ timeout: AI_TIMEOUT });
    await page.getByRole("button", { name: "Save to question bank" }).click();
    await page.getByText("Saved to your question bank").waitFor();
    await shot("e2e_practice");
    step("AI practice: questions, feedback with STAR, saved to the bank");
  }

  // ---- Contacts ----
  await page.goto(`${BASE}/contacts`);
  await page.getByRole("button", { name: "New contact" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Marie Gagnon");
  await page.getByLabel("Company", { exact: true }).fill("Northwind Labs");
  await page.getByRole("dialog").getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Contact added").waitFor();
  step("contact created and linked");

  // ---- Board ----
  await page.goto(`${BASE}/applications`);
  const card = page.locator('a[href^="/applications/"]', { hasText: "Northwind Labs" });
  await card.dragTo(page.getByRole("region", { name: "Recruiter contact" }));
  await page.getByText("Moved to Recruiter contact").waitFor();
  step("drag & drop moves the card");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("region", { name: "Applied" }).getByText("Northwind Labs").waitFor();
  await card.dragTo(page.getByRole("region", { name: "Recruiter contact" }));
  await page.getByRole("region", { name: "Recruiter contact" }).getByText("Northwind Labs").waitFor();
  step("a move can be undone from the toast");

  // ---- Overview, analytics, assistant, search ----
  await page.goto(`${BASE}/dashboard`);
  await page.getByText("Upcoming interviews").waitFor();
  if (aiEnabled) {
    await page.getByRole("button", { name: "Write my debrief" }).click();
    await page.getByText(/Every line cites facts/).waitFor({ timeout: AI_TIMEOUT });
    step("AI weekly debrief with cited facts");
  }
  await shot("e2e_dashboard");
  step("dashboard shows the new data");

  for (const tab of ["pipeline", "works", "market"]) {
    await page.goto(`${BASE}/analytics?tab=${tab}`);
    await page.getByRole("tab", { selected: true }).waitFor();
  }
  await page.getByText("Most requested skills").waitFor();
  step("all analytics tabs render");

  // ---- Agent: opens anywhere with J; proposes changes that only happen once confirmed ----
  await page.goto(`${BASE}/agenda`);
  await page.getByRole("button", { name: /Ask JobPilot/ }).waitFor();
  await page.keyboard.press("j");
  const agentPanel = page.getByRole("complementary", { name: "JobPilot agent" });
  await agentPanel.waitFor();
  if (aiEnabled) {
    await agentPanel.getByRole("textbox", { name: "Message to the agent" }).fill("Create a task called Send references, due 2026-11-05");
    await page.keyboard.press("Enter");
    const proposals = agentPanel.getByRole("group", { name: "Proposed changes" });
    await proposals.waitFor({ timeout: AI_TIMEOUT });
    await shot("e2e_agent_proposal");
    await proposals.getByRole("button", { name: "Confirm" }).first().click();
    await proposals.getByText("Done").first().waitFor();
    await page.getByText("Send references").first().waitFor();  // the agenda refreshed by itself
    step("agent proposes a task, which is created only after confirmation");
  } else {
    await agentPanel.getByText(/AI features are off/).waitFor();
  }
  await page.keyboard.press("Escape");
  await agentPanel.waitFor({ state: "detached" });
  step("agent panel opens with J and closes with Escape");

  await page.goto(`${BASE}/dashboard`);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Northwind");
  await page.getByRole("dialog", { name: "Search" }).getByText("Backend Engineer").first().waitFor();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/applications\/[0-9a-f-]{36}$/);
  step("global search opens the application");

  for (const [from, to] of [["/calendar", "/agenda"], ["/tasks", "/agenda"], ["/resumes", "/profile?tab=resumes"], ["/stats", "/analytics"]]) {
    await page.goto(`${BASE}${from}`);
    await page.waitForURL(`**${to}`);
  }
  step("old links redirect to the merged pages");

  // ---- Keyboard shortcuts, bulk actions, theme ----
  await page.goto(`${BASE}/dashboard`);
  await page.getByText("Upcoming interviews").waitFor();
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await page.waitForURL("**/applications");
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.keyboard.press("n");
  await page.waitForURL("**/applications?new=1");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  step("keyboard shortcuts navigate, open help and the new-application form");

  await page.goto(`${BASE}/applications?view=list`);
  await page.getByRole("checkbox", { name: "Select all applications" }).check();
  const bulk = page.getByRole("region", { name: "Bulk actions" });
  await bulk.getByText(/^\d+ selected$/).waitFor();
  await bulk.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: /^Delete \d+ applications?\?$/ }).getByRole("button", { name: "Cancel" }).click();
  await bulk.getByLabel("Move selected to status").selectOption("OFFER");
  await page.getByText(/^Moved \d+ applications? to Offer$/).waitFor();
  await bulk.waitFor({ state: "detached" });
  await page.getByRole("combobox", { name: /^Status of / }).first().evaluate((el) => {
    if (el.value !== "OFFER") throw new Error(`bulk move did not apply: ${el.value}`);
  });
  step("bulk selection moves applications; delete asks for confirmation");

  await page.getByRole("button", { name: /@jobpilot\.dev/ }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("radio", { name: "Ocean" }).click();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark")
                                    && document.documentElement.dataset.accent === "ocean");
  await shot("e2e_dark");
  await page.goto(`${BASE}/settings`);
  await page.getByRole("radio", { name: "Light" }).click();
  await page.getByRole("radio", { name: "Forest" }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  step("theme and accent switch, and survive a reload");

  // ---- Password change ----
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("Current password", { exact: true }).fill("Demo1234!");
  await page.getByLabel("New password", { exact: true }).fill("N3w-Passw0rd!");
  await page.getByLabel("Confirm new password", { exact: true }).fill("N3w-Passw0rd!");
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByText("Password changed").waitFor();
  await page.goto(`${BASE}/dashboard`);
  await page.getByText("Upcoming interviews").waitFor();
  step("password changed, this session continues");

  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Log out" }).last().click();
  await page.waitForURL("**/login");
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL("**/login**");
  await page.fill('input[type="email"]', "new@jobpilot.dev");
  await page.fill('input[type="password"]', "Demo1234!");
  await page.click('button[type="submit"]');
  await page.getByText("Invalid email or password").waitFor();
  await page.fill('input[type="password"]', "N3w-Passw0rd!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  step("logout guards pages; only the new password works");

  if (problems.length) { console.log(problems.join("\n")); process.exitCode = 1; }
  else console.log(`All ${count} steps passed. No page errors or server errors.`);
  await browser.close();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
