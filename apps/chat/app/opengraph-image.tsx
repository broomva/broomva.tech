import { ImageResponse } from "next/og";

export const alt = "broomva.tech — Build, Create, Converge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
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
          background:
            "radial-gradient(ellipse 80% 60% at 75% 55%, #0A3D8F22 0%, transparent 70%), linear-gradient(145deg, #000B18 0%, #001F3F 40%, #0A3D8F 100%)",
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
            fontWeight: 700,
          }}
        >
          BROOMVA.TECH
        </div>

        {/* Tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              fontSize: 58,
              color: "#FFFFFF",
              lineHeight: 1.1,
              fontWeight: 700,
            }}
          >
            Build what you love.
          </div>
          <div
            style={{
              fontSize: 58,
              color: "#FFFFFF",
              lineHeight: 1.1,
              fontWeight: 700,
            }}
          >
            Let agents handle the rest.
          </div>
        </div>

        {/* Subtitle + singularity mark */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
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
          {/* Singularity mark */}
          <div
            style={{
              display: "flex",
              width: 64,
              height: 64,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, #FFFFFF 0%, #B8D4FF 20%, #3B7BF7 45%, #0A3D8F 70%, transparent 100%)",
              boxShadow: "0 0 40px #3B7BF788, 0 0 80px #0A3D8F44",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
