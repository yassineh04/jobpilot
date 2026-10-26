"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { CvImportDialog } from "@/components/profile/CvImport";
import { useAgent } from "@/components/agent/AgentProvider";

interface Step {
  title: string;
  text: string;
  done: boolean;
  action: React.ReactNode;
}

/** First-run checklist, shown until the first application is saved. */
export function Onboarding() {
  const agent = useAgent();
  const [importing, setImporting] = useState(false);
  const { data } = useAsync(() => Promise.all([api.profileSummary(), api.listResumes()]), []);
  const [summary, resumes] = data ?? [null, []];
  const cvDone = !!summary && (summary.totals.experiences > 0 || resumes.some((r) => r.file_name));
  const prefsDone = !!summary?.checklist.find((c) => c.key === "preferences")?.done;

  const steps: Step[] = [
    {
      title: "Import your CV", done: cvDone,
      text: "Your roles, education and skills are read from the PDF. You review everything before it is saved.",
      action: <Button size="sm" variant={cvDone ? "ghost" : "primary"} onClick={() => setImporting(true)}>{cvDone ? "Import again" : "Upload PDF"}</Button>,
    },
    {
      title: "Save a job you are interested in", done: false,
      text: "Paste its link (Greenhouse, Lever, Ashby or most career sites) and the details fill themselves.",
      action: <ButtonLink href="/applications?new=1" size="sm" variant={cvDone ? "primary" : "secondary"}>Add a job</ButtonLink>,
    },
    {
      title: "Set your search preferences", done: prefsDone,
      text: "Locations, work mode and salary. Postings that don't fit are flagged.",
      action: <ButtonLink href="/profile?tab=preferences" size="sm" variant="ghost">Open</ButtonLink>,
    },
    {
      title: "Ask the agent", done: false,
      text: "Tell it what happened (“I have an interview with Shopify on Tuesday at 10”) and confirm what it prepares.",
      action: <Button size="sm" variant="ghost" onClick={() => agent.setOpen(true)}>Try it</Button>,
    },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-stone-900">Set up your job search</h2>
          <p className="mt-0.5 text-[13px] text-stone-500">Four steps, about five minutes. Your pipeline and analytics build from there.</p>
        </div>
        <p className="text-xs tabular-nums text-stone-500">{completed} of {steps.length} done</p>
      </div>
      <ol>
        {steps.map((step, i) => (
          <li key={step.title} className={cn("flex items-center gap-4 border-b border-stone-100 px-5 py-3.5 last:border-b-0",
                                             step.done && "bg-stone-50/60")}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                                step.done ? "bg-accent-600 text-on-accent" : "border border-stone-300 text-stone-600")}>
              {step.done ? <Check className="size-3.5" aria-label="Done" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px] font-medium", step.done ? "text-stone-500" : "text-stone-900")}>{step.title}</p>
              <p className="text-xs text-stone-500">{step.text}</p>
            </div>
            <div className="shrink-0">{step.action}</div>
          </li>
        ))}
      </ol>
      {importing && <CvImportDialog onClose={() => setImporting(false)} />}
    </Card>
  );
}
