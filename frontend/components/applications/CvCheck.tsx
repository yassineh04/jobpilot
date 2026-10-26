"use client";
import Link from "next/link";
import { Check, FileUp, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import type { CvCheck as CvCheckData } from "@/lib/types";
import { Card, CardHeader, ErrorBanner, Meter, Note, Skeleton } from "@/components/ui/Primitives";

function Keyword({ skill, inCv }: { skill: string; inCv: boolean }) {
  return (
    <li className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs",
                      inCv ? "bg-accent-50 text-accent-800" : "border border-dashed border-stone-300 text-stone-600")}>
      {inCv ? <Check className="size-3" aria-hidden /> : <X className="size-3 text-stone-400" aria-hidden />}
      {skill}<span className="sr-only">{inCv ? ", in your CV" : ", not in your CV"}</span>
    </li>
  );
}

function Body({ data }: { data: CvCheckData }) {
  if (data.status === "no_resume") {
    return (
      <div className="flex flex-col items-start gap-3 p-4 text-[13px] text-stone-600 sm:flex-row sm:items-center sm:justify-between">
        <p>Upload the PDF you send to employers to see which of this posting&apos;s skills it actually mentions.</p>
        <Link href="/profile?tab=resumes&import=cv"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 text-[13px] font-medium text-stone-800 hover:bg-stone-50">
          <FileUp className="size-3.5" />Upload a CV
        </Link>
      </div>
    );
  }
  if (data.status === "no_posting") {
    return <p className="p-4 text-[13px] text-stone-600">Add the job description to compare it with your CV.</p>;
  }
  const found = data.required.filter((k) => k.in_cv).length;
  return (
    <div className="space-y-4 p-4">
      {data.required.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="font-medium text-stone-900">{found} of {data.required.length} required skills appear in your CV</span>
            <span className="tabular-nums text-stone-500">{data.coverage}%</span>
          </div>
          <Meter value={data.coverage} tone={data.coverage !== null && data.coverage >= 70 ? "bg-accent-500" : "bg-amber-500"} />
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Required skills">
            {data.required.map((k) => <Keyword key={k.skill} skill={k.skill} inCv={k.in_cv} />)}
          </ul>
        </div>
      ) : (
        <p className="text-[13px] text-stone-600">No required skills were detected in this posting.</p>
      )}
      {data.preferred.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-500">Nice to have</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Nice-to-have skills">
            {data.preferred.map((k) => <Keyword key={k.skill} skill={k.skill} inCv={k.in_cv} />)}
          </ul>
        </div>
      )}
      {found < data.required.length && (
        <Note>
          A missing word is not always a missing skill. If you have it, write it in your CV with the posting&apos;s wording:
          keyword filters match words, not meaning.
        </Note>
      )}
    </div>
  );
}

/** Which of the posting's skills are written in the CV PDF, as a keyword filter (ATS) would read it. */
export function CvCheck({ applicationId }: { applicationId: string }) {
  const { data, error, loading, reload } = useAsync(() => api.cvCheck(applicationId), [applicationId]);
  const resume = data?.resume;
  return (
    <Card>
      <CardHeader title="Keywords in your CV"
                  description={resume
                    ? `Read from ${resume.name}${resume.version ? ` ${resume.version}` : ""}${resume.attached ? ", the resume sent for this application" : ", your latest PDF"}`
                    : "As an applicant tracking system would read it"} />
      {error ? <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>
        : loading && !data ? <div className="p-4"><Skeleton className="h-24" /></div>
        : data && <Body data={data} />}
    </Card>
  );
}
