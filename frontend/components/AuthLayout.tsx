import Link from "next/link";
import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children, footer }: {
  title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="px-6 py-5"><Link href="/" aria-label="JobPilot home"><Logo /></Link></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
          <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">{children}</div>
          <p className="mt-5 text-center text-[13px] text-stone-500">{footer}</p>
        </div>
      </main>
    </div>
  );
}
