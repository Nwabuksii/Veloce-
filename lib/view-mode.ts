"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoredUser } from "@/lib/client-session";

// "View as" for the profile dropdown. A scribe can do everything a student
// can, and an admin everything a scribe can, so higher roles get a switch to
// see the app the way a lower role does. This is display-only: it changes
// the nav and menu, never what the server allows (that still follows the
// real role — see lib/session.ts).

export type Role = StoredUser["role"];

const KEY = "veloce_view_as";
const EVENT = "veloce:viewmode";
const ORDER: Role[] = ["STUDENT", "SCRIBE", "ADMIN"];

// Student: no switch. Scribe: Student | Scribe. Admin: Student | Scribe | Admin.
export function allowedModes(role: Role): Role[] {
  return ORDER.slice(0, ORDER.indexOf(role) + 1);
}

function read(role: Role): Role {
  try {
    const saved = localStorage.getItem(KEY) as Role | null;
    if (saved && allowedModes(role).includes(saved)) return saved;
  } catch {}
  return role;
}

export function useViewMode(role: Role | undefined): [Role | undefined, (m: Role) => void] {
  const [mode, setMode] = useState<Role | undefined>(role);

  useEffect(() => {
    if (!role) return;
    const sync = () => setMode(read(role));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [role]);

  const set = useCallback((m: Role) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [mode, set];
}

export const HOME_FOR: Record<Role, string> = { STUDENT: "/dashboard", SCRIBE: "/scribe", ADMIN: "/admin" };
