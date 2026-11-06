import type { HapticsPlugin, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Nur Typ-Import: das Plugin kommt zur Laufzeit von der nativen Brücke.
// Im Browser und in App-Versionen ohne Plugin passiert nichts.
function plugin(): HapticsPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Capacitor?.Plugins?.Haptics as HapticsPlugin | undefined;
}

function run(call: (p: HapticsPlugin) => Promise<void>) {
  const p = plugin();
  if (!p) return;
  try {
    call(p).catch(() => {});
  } catch {
    // Haptik ist nur Beiwerk
  }
}

export const hapticTap = () => run((p) => p.impact({ style: "LIGHT" as ImpactStyle }));
export const hapticSuccess = () => run((p) => p.notification({ type: "SUCCESS" as NotificationType }));
export const hapticError = () => run((p) => p.notification({ type: "ERROR" as NotificationType }));
