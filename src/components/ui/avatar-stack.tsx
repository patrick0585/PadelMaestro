export interface AvatarStackProps {
  names: string[];
  max?: number;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export function AvatarStack({ names, max = 5 }: AvatarStackProps) {
  const visible = names.slice(0, max);
  const overflow = Math.max(0, names.length - max);
  return (
    <div className="flex items-center" aria-label={names.join(", ")}>
      {visible.map((name, index) => (
        <span
          key={`${name}-${index}`}
          aria-hidden="true"
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface-elevated text-[0.65rem] font-extrabold text-primary ${
            index === 0 ? "" : "-ml-1.5"
          }`}
        >
          {initial(name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          className="-ml-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-background bg-surface-muted px-1 text-[0.65rem] font-extrabold text-foreground-muted"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
