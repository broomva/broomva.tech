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
          justifyContent: "space-between",
          padding: "60px 72px",
          background: "linear-gradient(145deg, #000B18 0%, #001F3F 40%, #0A3D8F 100%)",
          fontFamily: "CalSans",
          color: "#e2e0f0",
        }}
      >
        {/* Site name */}
        <div
          style={{
            display: "flex",
            fontSize: 24,
            letterSpacing: "0.15em",
            color: "#5B9BFF",
          }}
        >
          BROOMVA.TECH
        </div>

        {/* Tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              fontSize: 58,
              fontFamily: "CalSans",
              color: "#FFFFFF",
              lineHeight: 1.1,
            }}
          >
            Build what you love.
          </div>
          <div
            style={{
              fontSize: 58,
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
            display: "flex",
            fontSize: 22,
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
