"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PluginListenerHandle } from "@capacitor/core";
import type { ActionPerformed } from "@capacitor/push-notifications";
import { isNativeApp } from "@/lib/platform";
import { getPushPlugin, registerThisDevice } from "@/lib/push/client";

async function switchGroup(groupId: string): Promise<void> {
  try {
    // 403 (kein Mitglied mehr) ignorieren: dann bleibt die aktuelle Gruppe
    await fetch("/api/profile/active-group", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
  } catch {
    // Navigation trotzdem ausführen
  }
}

export function NativePush({ activeGroupId }: { activeGroupId: string | null }): null {
  const router = useRouter();
  const activeGroupRef = useRef(activeGroupId);
  const routerRef = useRef(router);

  useEffect(() => {
    activeGroupRef.current = activeGroupId;
    routerRef.current = router;
  }, [activeGroupId, router]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const plugin = getPushPlugin();
    if (!plugin) return;

    let cancelled = false;

    async function onTap({ notification }: ActionPerformed): Promise<void> {
      const data: unknown = notification.data;
      const groupId =
        typeof data === "object" && data !== null && "groupId" in data
          ? (data as { groupId: unknown }).groupId
          : undefined;
      if (typeof groupId === "string" && groupId !== activeGroupRef.current) {
        await switchGroup(groupId);
      }
      routerRef.current.push("/game-day");
      routerRef.current.refresh();
    }

    // Listener zuerst, damit der Tipp beim Kaltstart nicht verloren geht
    const handles: Promise<PluginListenerHandle>[] = [
      plugin.addListener("registration", ({ value }) => {
        void registerThisDevice(value);
      }),
      plugin.addListener("registrationError", ({ error }) => {
        console.error("[push] registration failed", error);
      }),
      plugin.addListener("pushNotificationActionPerformed", (action) => {
        void onTap(action);
      }),
    ];

    async function requestAndRegister(): Promise<void> {
      if (!plugin) return;
      let { receive } = await plugin.checkPermissions();
      if (cancelled) return;
      if (receive === "prompt" || receive === "prompt-with-rationale") {
        ({ receive } = await plugin.requestPermissions());
      }
      if (cancelled || receive !== "granted") return;
      await plugin.register();
    }

    requestAndRegister().catch((err: unknown) => {
      console.error("[push] setup failed", err);
    });

    return () => {
      cancelled = true;
      for (const handle of handles) {
        handle.then((h) => h.remove()).catch(() => {});
      }
    };
  }, []);

  return null;
}
