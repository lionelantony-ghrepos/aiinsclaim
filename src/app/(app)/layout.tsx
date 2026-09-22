import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AccessNoticeBanner } from "@/components/layout/access-notice-banner";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ProtectedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    notFound();
  }

  return (
    <AppShell user={user}>
      <Suspense fallback={null}>
        <AccessNoticeBanner />
      </Suspense>
      {children}
    </AppShell>
  );
}
