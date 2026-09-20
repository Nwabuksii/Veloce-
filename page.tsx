"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Fast client-side hint only — the actual session lives in an httpOnly
    // cookie we can't read here. If this is stale (e.g. cookie expired),
    // the dashboard's own fetch will 401 and bounce to /login anyway.
    router.replace(getStoredUser() ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
