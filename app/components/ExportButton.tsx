"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { friendlyErrorMessage } from "@/lib/api-client";

// Downloads an Excel file from one of the export routes. Not apiFetch: that
// wrapper expects JSON, and this response is a file.
export default function ExportButton({
  url,
  label = "Export to Excel",
  className = "btn btn-ghost",
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        let message = `Something went wrong (error ${res.status}).`;
        try {
          const data = await res.json();
          if (typeof data?.error === "string") message = data.error;
        } catch {}
        toast.error(message);
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "veloce-export.xlsx";
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success("Download started.");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={download} disabled={busy}>
      {busy ? "Preparing..." : label}
    </button>
  );
}
