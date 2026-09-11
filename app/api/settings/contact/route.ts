import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

// Returns the site's one dedicated support address for the Settings
// page's "Contact admin" button to build a real mailto: link — a fixed
// inbox rather than looking up whichever admin exists at the user's
// university, so students always reach the same dedicated place.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  return NextResponse.json({ adminEmail: SUPPORT_EMAIL });
});
