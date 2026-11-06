import type { AppleSignInPlugin, SignInOptions, SignInResult } from "@capawesome/capacitor-apple-sign-in";
import { isNativeApp } from "@/lib/platform";

const APPLE_JS_URL = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/de_DE/appleid.auth.js";

/** What the "apple" credentials provider expects, see signIn("apple", ...). */
export interface AppleCredentials {
  identityToken: string;
  authorizationCode?: string;
  givenName?: string;
  familyName?: string;
}

// Nur Typ-Import: das Plugin kommt zur Laufzeit von der nativen Brücke.
function plugin(): AppleSignInPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Capacitor?.Plugins?.AppleSignIn as AppleSignInPlugin | undefined;
}

/** In the app only when the build contains the plugin; in the browser always (Apple JS). */
export function isNativeAppleAvailable(): boolean {
  return isNativeApp() ? plugin() !== undefined : true;
}

interface AppleNonce {
  nonce: string;
  /** Web client ID and return URL come from the server config; null when Apple is not set up. */
  servicesId: string | null;
  redirectUri: string | null;
}

/** Fetches the one-time nonce; it also sets the matching httpOnly cookie. */
export async function fetchAppleNonce(): Promise<AppleNonce> {
  const res = await fetch("/api/auth/apple/nonce", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error("nonce");
  return (await res.json()) as AppleNonce;
}

export function isAppleCancel(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const msg = String((e as { message?: unknown } | null)?.message ?? "");
  return code === "SIGN_IN_CANCELED" || code === "1001" || msg === "popup_closed_by_user" || msg === "user_cancelled_authorize";
}

export async function signInWithAppleNative(nonce: string): Promise<AppleCredentials> {
  const p = plugin();
  if (!p) throw new Error("apple_plugin_missing");
  // The nonce goes into the token's nonce claim unchanged; the server accepts it raw or as SHA-256 hex.
  const r: SignInResult = await p.signIn({ nonce, scopes: ["EMAIL", "FULL_NAME"] as SignInOptions["scopes"] });
  return {
    identityToken: r.idToken,
    authorizationCode: r.authorizationCode,
    givenName: r.givenName ?? undefined,
    familyName: r.familyName ?? undefined,
  };
}

interface AppleIdJs {
  auth: {
    init(c: {
      clientId: string;
      scope: string;
      redirectURI: string;
      usePopup: boolean;
      nonce: string;
      state?: string;
    }): void;
    signIn(): Promise<{
      authorization: { id_token: string; code: string };
      user?: { name?: { firstName?: string; lastName?: string } };
    }>;
  };
}

let scriptPromise: Promise<void> | undefined;
function loadAppleJs(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = APPLE_JS_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("apple_js_load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export async function signInWithAppleWeb({ nonce, servicesId, redirectUri }: AppleNonce): Promise<AppleCredentials> {
  if (!servicesId) throw new Error("apple_unconfigured");
  await loadAppleJs();
  const AppleID = (window as unknown as { AppleID?: AppleIdJs }).AppleID;
  if (!AppleID) throw new Error("apple_js_load");
  AppleID.auth.init({
    clientId: servicesId,
    scope: "name email",
    redirectURI: redirectUri ?? `${window.location.origin}/api/auth/callback/apple`,
    usePopup: true,
    nonce,
  });
  const r = await AppleID.auth.signIn();
  return {
    identityToken: r.authorization.id_token,
    authorizationCode: r.authorization.code,
    givenName: r.user?.name?.firstName,
    familyName: r.user?.name?.lastName,
  };
}

/** Native sheet inside the app, Apple JS popup in the browser. */
export async function signInWithApple(): Promise<AppleCredentials> {
  const config = await fetchAppleNonce();
  return isNativeApp() ? signInWithAppleNative(config.nonce) : signInWithAppleWeb(config);
}
