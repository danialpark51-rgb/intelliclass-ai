import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/components/intelliclass/reset-password-page";
import { pageMeta } from "@/lib/intelliclass";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () => pageMeta("Reset Password", "Choose a new password for your IntelliClass account."),
  component: Page,
});

function Page() {
  const { token } = Route.useSearch();
  return <ResetPasswordPage token={token} />;
}
