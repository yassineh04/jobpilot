"use client";

import Link from "next/link";
import { ArrowRight, Check, Link2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/Logo";
import { AgentMark } from "@/components/agent/AgentMark";
import { ThemeToggle } from "@/components/shell/UserMenu";

/* ---------- Product fragments: real UI pieces with sample data, not screenshots ---------- */

function Frame({ title, meta, className, children }: { title: string; meta?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-stone-200 bg-white text-left shadow-pop", className)}>
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
        <p className="text-[13px] font-semibold text-stone-900">{title}</p>
        {meta && <p className="text-[11px] text-stone-500">{meta}</p>}
      </div>
      {children}
    </div>
  );
}

function Chip({ on = true, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium",
                        on ? "bg-accent-50 text-accent-800" : "border border-dashed border-stone-300 text-stone-500")}>
      {on ? <Check className="size-3" /> : <X className="size-3 text-stone-400" />}{children}
    </span>
  );
}

function LinkImport() {
  return (
    <Frame title="New application" meta="Imported from Lever">
      <div className="space-y-3 p-4">
        <div className="flex h-8 items-center gap-2 rounded-md border border-stone-300 px-2.5 text-xs text-stone-500">
          <Link2 className="size-3.5" /><span className="truncate">jobs.lever.co/northwind/4f1c…</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[["Position", "Backend Developer"], ["Company", "Northwind"], ["Location", "Montreal · Hybrid"], ["Salary", "95k–120k CAD"]].map(([k, v]) => (
            <div key={k} className="rounded-md border border-accent-300 bg-accent-50/40 px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-stone-500">{k}</p>
              <p className="font-medium text-stone-900">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function AgentProposal({ prompt, intro, items }: { prompt: string; intro: string; items: [string, string][] }) {
  return (
    <Frame title="JobPilot agent">
      <div className="space-y-3 p-4 text-xs">
        <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-stone-900 px-3 py-2 text-white">{prompt}</p>
        <div className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-600 text-on-accent"><AgentMark className="size-3" /></span>
          <div className="flex-1 space-y-2">
            <p className="text-stone-700">{intro}</p>
            {items.map(([t, d]) => (
              <div key={t} className="rounded-md border border-stone-200 px-2.5 py-2">
                <p className="font-medium text-stone-900">{t}</p>
                <p className="text-stone-500">{d}</p>
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <span className="rounded px-2 py-0.5 text-stone-500">Dismiss</span>
                  <span className="rounded bg-accent-600 px-2 py-0.5 font-medium text-on-accent">Confirm</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function CvReview() {
  return (
    <Frame title="Import from your CV" meta="alex-martin-cv.pdf">
      <div className="space-y-3 p-4 text-xs">
        {[["Software Developer Intern · Lightspeed", "May 2024 – Aug 2024"], ["Teaching Assistant · Concordia", "Sep 2023 – Present"]].map(([t, d]) => (
          <div key={t} className="flex gap-2.5">
            <span className="mt-0.5 flex size-3.5 items-center justify-center rounded-sm bg-accent-600 text-on-accent"><Check className="size-2.5" /></span>
            <div><p className="font-medium text-stone-900">{t}</p><p className="text-stone-500">{d}</p></div>
          </div>
        ))}
        <div className="flex flex-wrap gap-1">
          {["Python", "FastAPI", "PostgreSQL", "Docker", "React"].map((s) => (
            <span key={s} className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-600 px-2 text-[11px] font-medium text-on-accent"><Check className="size-3" />{s}</span>
          ))}
        </div>
        <p className="border-t border-stone-100 pt-2 text-[11px] text-stone-500">2 items left out because they do not appear in the PDF.</p>
      </div>
    </Frame>
  );
}

function KeywordCheck() {
  return (
    <Frame title="Keywords in your CV" meta="Backend Developer · Northwind">
      <div className="space-y-2.5 p-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-stone-900">5 of 7 required skills appear in your CV</span>
          <span className="tabular-nums text-stone-500">71%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full w-[71%] rounded-full bg-accent-500" /></div>
        <div className="flex flex-wrap gap-1">
          {["Python", "PostgreSQL", "Docker", "REST APIs", "Git"].map((s) => <Chip key={s}>{s}</Chip>)}
          <Chip on={false}>Kubernetes</Chip><Chip on={false}>AWS</Chip>
        </div>
      </div>
    </Frame>
  );
}

function Funnel() {
  const rows: [string, number, number][] = [["Applied", 38, 100], ["Recruiter contact", 14, 37], ["Interview", 7, 18], ["Offer", 2, 5]];
  return (
    <Frame title="Pipeline" meta="Last 90 days · 38 applications">
      <div className="space-y-2.5 p-4 text-xs">
        {rows.map(([label, n, pct]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between"><span className="text-stone-700">{label}</span><span className="tabular-nums text-stone-500">{n}</span></div>
            <div className="h-1.5 rounded-full bg-stone-100"><div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} /></div>
          </div>
        ))}
        <p className="pt-1 text-[11px] text-stone-500">Biggest drop: Applied → Recruiter contact. 63% of applications got no reply.</p>
      </div>
    </Frame>
  );
}

/* ---------- Page ---------- */

const STEPS = [
  { title: "Start from your CV", fragment: <CvReview />,
    text: "Upload the PDF you already send. Roles, education, projects, skills and languages are read from it, and anything the model returns that isn't in the document is dropped. You pick what goes into your profile." },
  { title: "Save jobs from their link", fragment: <KeywordCheck />,
    text: "Paste a Greenhouse, Lever or Ashby link, or any career page. The form fills itself, and each posting is checked against the words actually written in your CV, the way a keyword filter reads it." },
  { title: "Hand the busywork to the agent",
    fragment: <AgentProposal prompt="Who should I follow up with this week?" intro="Two contacts are overdue. I prepared reminders:"
                             items={[["Create task “Follow up with Sarah Lavoie”", "Follow up · due tomorrow · Shopify"],
                                     ["Create task “Thank Nadia for the referral”", "Networking · due Oct 28 · Desjardins"]]} />,
    text: "Tell it what happened in plain words. It finds the right application, prepares the interview, the task or the status change, and waits. Nothing is saved until you press Confirm." },
  { title: "See where your search stalls", fragment: <Funnel />,
    text: "Conversion between stages, response times, rejection reasons and which sources work. Every number shows how many applications it is based on." },
];

const ALSO = [
  "Board and list views, drag and drop, bulk moves with undo",
  "Agenda with interviews, tasks and application deadlines",
  "Add interviews to Google Calendar, Outlook or Apple Calendar",
  "Interview practice from the posting, and a question bank",
  "Recruiters and referrals with follow-up reminders",
  "Resume versions with the response rate of each one",
  "Cover letters and follow-up emails drafted from your own profile",
  "Command palette and keyboard shortcuts, light and dark themes",
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const primary = isAuthenticated
    ? <Link href="/dashboard" className={buttonClass("primary", "md", "h-10 px-4")}>Open your workspace<ArrowRight className="size-4" /></Link>
    : <Link href="/register" className={buttonClass("primary", "md", "h-10 px-4")}>Create a free account<ArrowRight className="size-4" /></Link>;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-1">
          <a href="#how" className={cn(buttonClass("ghost"), "hidden sm:inline-flex")}>How it works</a>
          <ThemeToggle />
          {isAuthenticated ? (
            <Link href="/dashboard" className={buttonClass("primary")}>Open JobPilot</Link>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost")}>Sign in</Link>
              <Link href="/register" className={cn(buttonClass("primary"), "ml-1")}>Create account</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="text-[13px] font-medium text-accent-700">Job search workspace</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-stone-900 md:text-[3.4rem]">
              Run your job search like a project, not a spreadsheet.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-stone-600">
              Import your CV, save jobs from their link, and keep every interview and follow-up in one place.
              An agent prepares the routine updates; you confirm each one.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {primary}
              {!isAuthenticated && (
                <Link href="/login" className="inline-flex items-center gap-1 text-sm font-medium text-stone-700 hover:text-stone-900">
                  I already have an account<ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
            <p className="mt-4 text-xs text-stone-500">Free. Nothing to install.</p>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="w-[92%]"><LinkImport /></div>
            <div className="relative ml-auto mt-3 w-[88%] animate-rise-in">
              <AgentProposal prompt="Technical interview with Northwind on Tuesday at 10" intro="I prepared two changes. Confirm the ones you want."
                             items={[["Schedule technical interview", "Tue Oct 27, 10:00 · 60 min"], ["Move Backend Developer to Interview", "Currently Applied"]]} />
            </div>
          </div>
        </section>

        <section id="how" className="border-y border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-stone-900 md:text-3xl">From the first posting to the offer</h2>
            <div className="mt-14 space-y-20">
              {STEPS.map((step, i) => (
                <div key={step.title} className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
                  <div className={cn(i % 2 === 1 && "md:order-2")}>
                    <p className="text-xs font-medium tabular-nums text-stone-500">0{i + 1}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-900">{step.title}</h3>
                    <p className="mt-3 max-w-md text-[15px] leading-relaxed text-stone-600">{step.text}</p>
                  </div>
                  <div className={cn("mx-auto w-full max-w-md", i % 2 === 1 && "md:order-1")}>{step.fragment}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">Also in JobPilot</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-600">
              The everyday parts of a job search, done properly.
            </p>
          </div>
          <ul className="grid gap-x-8 gap-y-3 text-sm text-stone-700 sm:grid-cols-2">
            {ALSO.map((item) => (
              <li key={item} className="flex gap-2.5 border-t border-stone-200 pt-3">
                <Check className="mt-0.5 size-4 shrink-0 text-accent-600" />{item}
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-stone-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900">Numbers you can check</h2>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-600">
                JobPilot never shows a chance of getting hired. It shows what happened, and where each figure comes from.
              </p>
            </div>
            <dl className="grid gap-x-8 gap-y-6 text-sm sm:grid-cols-2">
              {[
                ["Fit is a formula", "The compatibility score is a weighted sum you can open, requirement by requirement."],
                ["Small samples are labelled", "A response rate based on four applications says so."],
                ["AI claims are verified", "A quote that isn't in the posting, or a skill that isn't in your CV, is removed before you see it."],
                ["You stay in control", "The agent reads only your data and changes nothing without your confirmation."],
              ].map(([t, d]) => (
                <div key={t} className="border-t border-stone-200 pt-3">
                  <dt className="font-medium text-stone-900">{t}</dt>
                  <dd className="mt-1 leading-relaxed text-stone-600">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-stone-200 bg-white px-8 py-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-stone-900">Your next application, organized from day one</h2>
              <p className="mt-1.5 text-sm text-stone-600">Create an account, import your CV, and save your first job in a few minutes.</p>
            </div>
            <div className="shrink-0">{primary}</div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-stone-500">
          <Logo className="opacity-70" />
          <nav className="flex gap-4">
            <Link href="/login" className="hover:text-stone-800">Sign in</Link>
            <Link href="/register" className="hover:text-stone-800">Create account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
