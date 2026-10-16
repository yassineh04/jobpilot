import { redirect } from "next/navigation";

// Statistics were merged into Analytics; keep old links working.
export default function StatsRedirect() {
  redirect("/analytics");
}
