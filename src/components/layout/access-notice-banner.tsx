"use client";

import { useSearchParams } from "next/navigation";
import { AccessNotice } from "@/components/layout/access-notice";

export function AccessNoticeBanner() {
  const searchParams = useSearchParams();
  return <AccessNotice notice={searchParams.get("notice") ?? undefined} />;
}
