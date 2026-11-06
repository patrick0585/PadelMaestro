export function CourtBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[480px] overflow-hidden">
      <div
        className="absolute left-1/2 top-10 size-[360px] -translate-x-1/2 blur-[4px]"
        style={{ background: "radial-gradient(circle, rgba(34,211,238,.22), rgba(34,211,238,0) 62%)" }}
      />
      <svg
        viewBox="0 0 200 400"
        className="absolute left-1/2 top-[-40px] h-[420px] w-[420px] text-primary opacity-55"
        style={{ transform: "translateX(-50%) perspective(600px) rotateX(52deg)", transformOrigin: "50% 0" }}
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="6" y="6" width="188" height="388" rx="2" />
          <line x1="6" y1="200" x2="194" y2="200" strokeWidth="3" />
          <line x1="6" y1="78" x2="194" y2="78" />
          <line x1="6" y1="322" x2="194" y2="322" />
          <line x1="100" y1="78" x2="100" y2="322" />
        </g>
      </svg>
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(11,18,32,0) 20%, var(--background) 95%)" }}
      />
    </div>
  );
}
