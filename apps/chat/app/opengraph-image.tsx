import { ImageResponse } from "next/og";

export const alt = "broomva.tech — Build, Create, Converge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const calSansData = await fetch(
    new URL("../public/fonts/CalSans-SemiBold.ttf", import.meta.url),
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(145deg, #000B18 0%, #001F3F 30%, #0A3D8F 70%, #001F3F 100%)",
          fontFamily: "CalSans",
          color: "#e2e0f0",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Concentric lensing rings */}
        {[220, 180, 145, 115, 90, 68, 50, 35].map((r, i) => (
          <div
            key={r}
            style={{
              position: "absolute",
              left: 600 - r,
              top: 315 - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `${0.5 + i * 0.15}px solid rgba(59, 123, 247, ${0.08 + i * 0.04})`,
            }}
          />
        ))}

        {/* Core glow */}
        <div
          style={{
            position: "absolute",
            left: 575,
            top: 290,
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(126,184,255,0.4) 40%, rgba(59,123,247,0.1) 70%, transparent 100%)",
          }}
        />

        {/* Site name */}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 72,
            display: "flex",
            fontSize: 24,
            letterSpacing: "0.15em",
            textTransform: "uppercase" as const,
            color: "#5B9BFF",
          }}
        >
          broomva.tech
        </div>

        {/* Tagline */}
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: 72,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontFamily: "CalSans",
              color: "#FFFFFF",
              lineHeight: 1.1,
            }}
          >
            Build what you love.
          </div>
          <div
            style={{
              fontSize: 56,
              fontFamily: "CalSans",
              color: "#FFFFFF",
              lineHeight: 1.1,
            }}
          >
            Let agents handle the rest.
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            position: "absolute",
            bottom: 55,
            left: 72,
            display: "flex",
            fontSize: 20,
            color: "#7EB8FF",
            letterSpacing: "0.04em",
          }}
        >
          AI-native platform for autonomous creation
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "CalSans",
          data: calSansData,
          style: "normal",
          weight: 600,
        },
      ],
    },
  );
}
