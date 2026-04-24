import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#0b1220",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="160" height="160">
          <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <g transform="rotate(-22 32 32)">
            <path
              d="M32 6 C 22 6, 14 14, 14 23 L 14 33 C 14 39, 18 43, 24 43 L 40 43 C 46 43, 50 39, 50 33 L 50 23 C 50 14, 42 6, 32 6 Z"
              fill="url(#g)"
            />
            <circle cx="23" cy="17" r="1.6" fill="#0b1220" />
            <circle cx="32" cy="17" r="1.6" fill="#0b1220" />
            <circle cx="41" cy="17" r="1.6" fill="#0b1220" />
            <circle cx="23" cy="25" r="1.6" fill="#0b1220" />
            <circle cx="32" cy="25" r="1.6" fill="#0b1220" />
            <circle cx="41" cy="25" r="1.6" fill="#0b1220" />
            <circle cx="23" cy="33" r="1.6" fill="#0b1220" />
            <circle cx="32" cy="33" r="1.6" fill="#0b1220" />
            <circle cx="41" cy="33" r="1.6" fill="#0b1220" />
            <circle cx="27" cy="40" r="1.6" fill="#0b1220" />
            <circle cx="37" cy="40" r="1.6" fill="#0b1220" />
            <rect x="30" y="43" width="4" height="4" fill="url(#g)" />
            <rect
              x="28.5"
              y="47"
              width="7"
              height="13"
              rx="2.5"
              fill="#0b1220"
              stroke="url(#g)"
              strokeWidth="1.5"
            />
          </g>
          <circle cx="52" cy="50" r="5.5" fill="#fde047" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
