"use client";
import { useId, useState, useSyncExternalStore } from "react";
import { signIn } from "next-auth/react";
import { isAppleCancel, isNativeAppleAvailable, signInWithApple } from "@/lib/native/apple-sign-in";
import { APPLE_ERROR_MESSAGES, type AppleErrorCode } from "@/lib/auth/apple/errors";
import { withNext } from "@/lib/auth/next-path";

const NOOP_SUBSCRIBE = () => () => {};

/** True on the server and in browsers; false only in an app build without the Apple plugin. */
export function useAppleAvailable(): boolean {
  return useSyncExternalStore(NOOP_SUBSCRIBE, isNativeAppleAvailable, () => true);
}

export function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 18" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M11.6 9c0-2 1.7-3 1.8-3.1-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.7-.8-2.8-.7C3 4.3 1.6 5.2.9 6.5-.6 9.1.5 13 2 15.1c.7 1 1.5 2.2 2.6 2.1 1-.1 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.6 1.1 0 1.8-1 2.5-2 .8-1.2 1.1-2.3 1.1-2.4 0 0-2-.8-2-3.7zM9.5 2.9C10.1 2.2 10.5 1.2 10.4.2 9.5.3 8.5.8 7.9 1.5c-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z"
      />
    </svg>
  );
}

const FALLBACK = APPLE_ERROR_MESSAGES.apple_invalid_token;

function messageFor(code: unknown): string {
  return typeof code === "string" && code in APPLE_ERROR_MESSAGES
    ? APPLE_ERROR_MESSAGES[code as AppleErrorCode]
    : FALLBACK;
}

interface AppleButtonProps {
  label: string;
  invitationToken?: string;
  next?: string;
  onError?: (message: string | null) => void;
}

export function AppleButton({ label, invitationToken, next, onError }: AppleButtonProps) {
  const available = useAppleAvailable();
  const errorId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);

  function setError(message: string | null) {
    setErrorState(message);
    onError?.(message);
  }

  async function onClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const credentials = await signInWithApple();
      const result = await signIn("apple", {
        ...credentials,
        ...(invitationToken && { invitationToken }),
        redirect: false,
      });
      if (!result || result.error) {
        setLoading(false);
        setError(messageFor(result?.code));
        return;
      }
      window.location.assign(withNext("/willkommen/name", next));
    } catch (e) {
      setLoading(false);
      if (isAppleCancel(e)) return;
      setError(APPLE_ERROR_MESSAGES.apple_unavailable);
    }
  }

  if (!available) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-describedby={error ? errorId : undefined}
        className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-white text-[15.5px] font-semibold tracking-[-0.01em] text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      >
        <AppleLogo className="-mt-0.5 h-[18px] w-[15px]" />
        <span>{loading ? "Einen Moment …" : label}</span>
      </button>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
