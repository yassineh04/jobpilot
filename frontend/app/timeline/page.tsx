import { redirect } from "next/navigation";

// History now lives on each application and on the Overview; keeps old links working.
export default function TimelineRedirect() {
  redirect("/dashboard");
}
