import { initials } from "@/lib/player/initials";

export type AvatarSize = 32 | 40 | 48 | 64 | 96;

const SIZE_CLASSES: Record<AvatarSize, string> = {
  32: "h-8 w-8 text-xs",
  40: "h-10 w-10 text-sm",
  48: "h-12 w-12 text-sm",
  64: "h-16 w-16 text-base",
  96: "h-24 w-24 text-xl",
};

export interface AvatarProps {
  playerId: string;
  name: string;
  avatarVersion: number;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({
  playerId,
  name,
  avatarVersion,
  size = 40,
  className = "",
}: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClass} ${className}`.trim();

  if (avatarVersion === 0) {
    return (
      <span
        aria-hidden="true"
        className={`${base} bg-surface-elevated font-semibold text-primary border border-border-strong`}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span className={base}>
      <img
        src={`/api/players/${playerId}/avatar?v=${avatarVersion}`}
        alt={name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </span>
  );
}
