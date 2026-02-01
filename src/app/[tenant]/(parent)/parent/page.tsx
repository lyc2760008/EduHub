import { redirect } from "next/navigation";

export default async function ParentDashboardPage() {
  // Redirect legacy /parent entry points to the new portal dashboard route.
  redirect("./portal");
}
