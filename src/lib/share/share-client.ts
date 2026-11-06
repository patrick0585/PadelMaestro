import type { FilesystemPlugin } from "@capacitor/filesystem";
import type { SharePlugin } from "@capacitor/share";

// Type-only imports: the plugins come from the native bridge at runtime (like push).
function nativePlugins(): { fs: FilesystemPlugin; share: SharePlugin } | null {
  if (typeof window === "undefined") return null;
  const p = window.Capacitor?.Plugins;
  const fs = p?.Filesystem as FilesystemPlugin | undefined;
  const share = p?.Share as SharePlugin | undefined;
  return fs?.writeFile && share?.share ? { fs, share } : null;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Web Share rejects with AbortError, the Capacitor share sheet with "Share canceled".
const isAbort = (e: unknown) =>
  (e instanceof DOMException && e.name === "AbortError") || /^share cancel+ed$/i.test(String((e as Error)?.message ?? ""));

/** Native share sheet in the app, Web Share in browsers, download as last resort. Cancelling is not an error. */
export async function shareImage(blob: Blob, fileName: string, title: string): Promise<void> {
  try {
    const native = nativePlugins();
    if (native) {
      // "CACHE" is Directory.Cache; importing the enum would pull the plugin's web code into the bundle.
      const directory = "CACHE" as never;
      const { uri } = await native.fs.writeFile({ path: fileName, data: await toBase64(blob), directory });
      try {
        await native.share.share({ title, files: [uri] });
      } finally {
        native.fs.deleteFile({ path: fileName, directory }).catch(() => {});
      }
      return;
    }
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, files: [file] });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    if (!isAbort(e)) throw e;
  }
}
