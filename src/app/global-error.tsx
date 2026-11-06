"use client";
import { useEffect, useState } from "react";
import { isStaleDeploymentError, reloadOnceForStaleDeployment } from "@/lib/stale-deployment";

// Replaces the root layout, so it cannot rely on the app's CSS.
const S = {
  body: { margin: 0, minHeight: "100vh", background: "#0b1220", color: "#f1f5f9", fontFamily: "system-ui, sans-serif" },
  box: { maxWidth: 420, margin: "0 auto", padding: "64px 20px", textAlign: "center" as const },
  btn: { marginTop: 20, minHeight: 48, width: "100%", border: 0, borderRadius: 16, background: "#bef264", color: "#0b1220", fontSize: 16, fontWeight: 600 },
};

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    console.error(error);
    if (isStaleDeploymentError(error) && reloadOnceForStaleDeployment()) setReloading(true);
  }, [error]);

  return (
    <html lang="de">
      <body style={S.body}>
        <div style={S.box}>
          {reloading ? (
            <p role="status">Es gibt eine neue Version der App. Einen Moment, sie wird geladen …</p>
          ) : (
            <>
              <h1 style={{ fontSize: 24 }}>Da ist etwas schiefgelaufen</h1>
              <p style={{ color: "#94a3b8" }}>Die App konnte nicht angezeigt werden. Meist hilft es, neu zu laden.</p>
              <button type="button" style={S.btn} onClick={() => window.location.reload()}>
                Neu laden
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
