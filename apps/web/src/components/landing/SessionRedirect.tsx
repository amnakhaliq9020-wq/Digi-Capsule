"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

export function SessionRedirect() {
  const router = useRouter();
  useEffect(() => {
    api("/v1/auth/me").then(() => router.replace("/dashboard")).catch(() => undefined);
  }, [router]);
  return null;
}
