import { DEMO_ACCOUNTS } from "@/lib/auth/demo-accounts";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : null;

  return (
    <LoginForm
      nextPath={nextPath}
      demoAccounts={DEMO_ACCOUNTS.map((account) => ({
        role: account.label,
        email: account.email,
      }))}
    />
  );
}
