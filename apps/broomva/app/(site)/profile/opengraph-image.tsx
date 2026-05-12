import { ImageResponse } from "next/og";
import {
  formatNumber,
  getCratesAggregate,
  getGitHubAggregate,
} from "@/lib/profile-stats";

export const alt =
  "Carlos D. Escobar-Valbuena — Agent OS Architect & AI Engineering Lead";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ProfileOG() {
  const [github, crates] = await Promise.all([
    getGitHubAggregate("broomva"),
    getCratesAggregate(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 72px",
          background:
            "radial-gradient(ellipse 80% 60% at 75% 55%, #0A3D8F22 0%, transparent 70%), linear-gradient(145deg, #000B18 0%, #001F3F 40%, #0A3D8F 100%)",
          color: "#e2e0f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top row: site mark + arcan-glass accent */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: "0.18em",
              color: "#5B9BFF",
              fontWeight: 700,
            }}
          >
            BROOMVA.TECH / PROFILE
          </div>
          <div
            style={{
              display: "flex",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, #FFFFFF 0%, #B8D4FF 20%, #3B7BF7 45%, #0A3D8F 70%, transparent 100%)",
              boxShadow: "0 0 36px #3B7BF788, 0 0 80px #0A3D8F44",
            }}
          />
        </div>

        {/* Name + tagline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            marginTop: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 64,
              color: "#FFFFFF",
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Carlos D. Escobar-Valbuena
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#7EB8FF",
              lineHeight: 1.3,
              letterSpacing: "0.01em",
            }}
          >
            Agent OS Architect &nbsp;·&nbsp; AI Engineering Lead
          </div>
        </div>

        {/* Roles strip */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "32px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: "#cbd5e1",
              lineHeight: 1.4,
            }}
          >
            Co-founder &amp; CTO @ Wedi Pay&nbsp;&nbsp;·&nbsp;&nbsp;Senior ML/AI
            Lead @ Stimulus
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: "#cbd5e1",
              lineHeight: 1.4,
            }}
          >
            Data Architect @ TEAM International&nbsp;&nbsp;·&nbsp;&nbsp;Author
            of Life Agent OS
          </div>
        </div>

        {/* KPI strip */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          {/* KPI tile 1 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "20px 24px",
              borderRadius: "16px",
              background: "rgba(123, 184, 255, 0.08)",
              border: "1px solid rgba(123, 184, 255, 0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 14,
                color: "#7EB8FF",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              GitHub stars
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 40,
                color: "#FFFFFF",
                fontWeight: 700,
                marginTop: "4px",
              }}
            >
              {formatNumber(github.totalStars)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 14,
                color: "#94a3b8",
                marginTop: "2px",
              }}
            >
              across {github.totalRepos} repos
            </div>
          </div>

          {/* KPI tile 2 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "20px 24px",
              borderRadius: "16px",
              background: "rgba(0, 204, 102, 0.07)",
              border: "1px solid rgba(0, 204, 102, 0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 14,
                color: "#5EE0A0",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              crates.io
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 40,
                color: "#FFFFFF",
                fontWeight: 700,
                marginTop: "4px",
              }}
            >
              {formatNumber(crates.totalDownloads)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 14,
                color: "#94a3b8",
                marginTop: "2px",
              }}
            >
              {crates.totalCrates} Life OS crates
            </div>
          </div>

          {/* KPI tile 3 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "20px 24px",
              borderRadius: "16px",
              background: "rgba(123, 184, 255, 0.08)",
              border: "1px solid rgba(123, 184, 255, 0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 14,
                color: "#7EB8FF",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Live profile
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 32,
                color: "#FFFFFF",
                fontWeight: 700,
                marginTop: "4px",
              }}
            >
              broomva.tech/profile
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 14,
                color: "#94a3b8",
                marginTop: "2px",
              }}
            >
              CV · engagements · OSS
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
