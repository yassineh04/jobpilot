"use client";

import Link from "next/link";
import {
  ArrowRight, BarChart3, CalendarClock, CheckCircle2, FileText, MessagesSquare, ScanSearch, ShieldCheck, Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { STATUS_META } from "@/lib/constants";
import type { Status } from "@/lib/types";
import { buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/Logo";

const FEATURES = [
  { icon: ScanSearch, title: "Paste a posting, get the details",
    text: "Title, location, salary, work mode and required skills are extracted from the text. Nothing is guessed when it isn't stated." },
  { icon: CheckCircle2, title: "Know how a job fits, and why",
    text: "A compatibility review shows which requirements your profile backs with evidence, which are self-reported, and which aren't listed yet." },
  { icon: BarChart3, title: "Learn from your own history",
    text: "Funnel conversion, response times, rejection reasons and job sources, with sample sizes so a small number never looks like a trend." },
  { icon: FileText, title: "Compare resume versions",
    text: "See the response rate observed for each resume you sent. Differences are only highlighted once there is enough data." },
  { icon: MessagesSquare, title: "Prepare where it matters",
    text: "Log interview questions and your confidence. The weakness map shows which topics come up most and where you feel least ready." },
  { icon: Users, title: "Keep your network warm",
    text: "Recruiters and referrals linked to applications, with follow-up dates that land on your overview when they're due." },
];

const BOARD: { status: Status; cards: [string, string][] }[] = [
  { status: "APPLIED", cards: [["Backend Developer", "Lightspeed"], ["Software Engineer", "Mozilla"]] },
  { status: "RECRUITER_CONTACT", cards: [["Platform Engineer", "Element"]] },
  { status: "INTERVIEW", cards: [["Backend Engineer", "Shopify"], ["Data Engineer", "Intact"]] },
  { status: "OFFER", cards: [["Software Developer", "Coveo"]] },
];

function ProductPreview() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-pop">
        <div className="flex items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-stone-200" /><span className="size-2.5 rounded-full bg-stone-200" /><span className="size-2.5 rounded-full bg-stone-200" />
          <span className="ml-3 text-xs text-stone-500">Applications</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          {BOARD.map((col) => (
            <div key={col.status} className="rounded-lg bg-stone-100/70 p-2">
              <p className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-stone-600">
                <span className={`size-2 rounded-full ${STATUS_META[col.status].dot}`} />{STATUS_META[col.status].label}
              </p>
              <div className="space-y-2">
                {col.cards.map(([role, company]) => (
                  <div key={role + company} className="rounded-md border border-stone-200 bg-white p-2.5">
                    <p className="text-xs font-medium text-stone-900">{role}</p>
                    <p className="text-[11px] text-stone-500">{company}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-24 -right-6 hidden w-64 rounded-lg border border-stone-200 bg-white p-4 text-left shadow-pop lg:block">
        <p className="text-xs font-medium text-stone-500">Compatibility · Shopify</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">78%</p>
        <div className="mt-2 space-y-1.5 text-xs">
          <p className="flex items-center gap-1.5 text-stone-700"><CheckCircle2 className="size-3.5 text-accent-600" />Python · internship, 2 projects</p>
          <p className="flex items-center gap-1.5 text-stone-700"><CheckCircle2 className="size-3.5 text-accent-600" />PostgreSQL · co-op</p>
          <p className="flex items-center gap-1.5 text-stone-500"><span className="size-3.5 rounded-full border border-dashed border-stone-400" />Kubernetes · not in profile</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link href="/dashboard" className={buttonClass("primary")}>Open JobPilot</Link>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost")}>Sign in</Link>
              <Link href="/register" className={buttonClass("primary")}>Create account</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center md:pt-24">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600">
            <CalendarClock className="size-3.5 text-accent-600" />Applications, interviews, resumes and contacts in one place
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-stone-900 md:text-[3.25rem]">
            Run your job search like a project, not a spreadsheet.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-stone-600">
            JobPilot keeps track of every application and turns your history into clear, honest insight:
            what&apos;s working, where things stall, and what to prepare next.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard" className={buttonClass("primary", "md", "h-10 px-5")}>Go to your overview <ArrowRight className="size-4" /></Link>
            ) : (
              <>
                <Link href="/register" className={buttonClass("primary", "md", "h-10 px-5")}>Get started, it&apos;s free <ArrowRight className="size-4" /></Link>
                <Link href="/login" className={buttonClass("secondary", "md", "h-10 px-5")}>I have an account</Link>
              </>
            )}
          </div>
          <div className="mt-16 lg:mb-16"><ProductPreview /></div>
        </section>

        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-6 py-20 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon className="size-5 text-accent-600" />
                <h2 className="mt-3 text-[15px] font-semibold text-stone-900">{f.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <ShieldCheck className="size-5 text-accent-600" />
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">Numbers you can trust</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              JobPilot never shows a “chance of getting hired”. Every score is a documented formula you can inspect,
              every statistic shows how many data points it&apos;s based on, and small samples are labelled as such.
            </p>
          </div>
          <ul className="space-y-3 text-sm text-stone-700">
            {["Compatibility is a transparent weighted formula, not a prediction",
              "Missing from your profile never counts as “you lack it”",
              "Resume comparisons are labelled as observational",
              "The assistant only reads your own data, through read-only lookups"].map((t) => (
              <li key={t} className="flex gap-2.5 rounded-md border border-stone-200 bg-white px-4 py-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-600" />{t}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-stone-500">
          <Logo className="opacity-70" />
          <span>Your data stays yours. Built with FastAPI, PostgreSQL and Next.js.</span>
        </div>
      </footer>
    </div>
  );
}
