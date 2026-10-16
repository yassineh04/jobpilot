import { redirect } from "next/navigation";

// Resumes now live in the Profile; keeps old links working.
export default function ResumesRedirect() {
  redirect("/profile?tab=resumes");
}
