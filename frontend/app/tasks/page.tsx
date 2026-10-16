import { redirect } from "next/navigation";

// Merged into the Agenda; keeps old links working.
export default function TasksRedirect() {
  redirect("/agenda");
}
