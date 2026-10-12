import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/intelliclass/public-pages";
import { pageMeta } from "@/lib/intelliclass";

export const Route = createFileRoute("/register")({
  head: () => pageMeta("Create Account", "Create an IntelliClass account using an invitation."),
  component: Page,
});

function Page() {
  return <AuthPage register />;
}
