import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const applicationId = ctx.params.id;

  const application = await prisma.scribeApplication.findUnique({
    where: { id: applicationId },
    include: { user: true },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (application.type !== "APPLICATION") {
    return NextResponse.json({ error: "This is an appeal, not an application — use the appeals endpoint" }, { status: 400 });
  }

  if (application.user.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot reject applicants outside your university" }, { status: 403 });
  }

  if (application.status !== "PENDING") {
    return NextResponse.json(
      { error: `Application already ${application.status.toLowerCase()}` },
      { status: 409 }
    );
  }

  const updatedApplication = await prisma.scribeApplication.update({
    where: { id: applicationId },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: adminUser.sub },
  });

  return NextResponse.json({ application: updatedApplication });
});
