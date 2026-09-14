"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface CourseOption {
  id: string;
  name: string;
  code: string;
}
interface BlockOption {
  id: string;
  title: string;
}
interface RequestOption {
  id: string;
  requestedTitle: string;
  voteCount: number;
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.6rem",
  marginTop: "0.4rem",
  borderRadius: "0.7rem",
  border: "1px solid var(--border-blue)",
};

// This page reads ?requestId=/?courseId= to support the "Fulfill this"
// one-click flow from the discovery feed — needs dynamic rendering so
// a production build doesn't try to statically prerender it.
export const dynamic = "force-dynamic";

// useSearchParams() opts the whole tree into client-side rendering during
// prerendering, and Next requires a Suspense boundary around whatever uses
// it — force-dynamic alone doesn't satisfy that during the build. The
// actual page logic lives in ScribeUploadForm below; this default export
// just supplies the required boundary around it.
export default function ScribeUploadPage() {
  return (
    <Suspense fallback={null}>
      <ScribeUploadForm />
    </Suspense>
  );
}

function ScribeUploadForm() {
