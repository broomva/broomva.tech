import { ImageResponse } from "next/og";
import { getContentBySlug, getAllSlugs } from "@/lib/content";

export const alt = "broomva.tech";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  const slugs = await getAllSlugs("projects");
  return slugs.map((slug) => ({ slug }));
}

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await getContentBySlug("projects", slug);

  const title = entry?.title ?? "broomva.tech";
  const summary = entry?.summary ?? "";
  const tags = entry?.tags ?? [];

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
            "radial-gradient(ellipse 70% 50% at 80% 60%, #0A3D8F33 0%, transparent 70%), linear-gradient(145deg, #000B18 0%, #001F3F 40%, #0A3D8F 100%)",
          color: "#e2e0f0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: 22,
            letterSpacing: "0.12em",
            color: "#5B9BFF",
            fontWeight: 700,
          }}
        >
          BROOMVA.TECH
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              fontSize: title.length > 60 ? 42 : 52,
              lineHeight: 1.15,
              color: "#ffffff",
              maxWidth: "1050px",
              fontWeight: 700,
            }}
          >
            {title}
          </div>
          {summary && (
            <div
              style={{
                fontSize: 22,
                lineHeight: 1.45,
                color: "#7EB8FF",
                maxWidth: "900px",
              }}
            >
              {summary.length > 160
                ? `${summary.slice(0, 157)}...`
                : summary}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", gap: "10px" }}>
            {tags.slice(0, 4).map((tag) => (
              <div
                key={tag}
                style={{
                  fontSize: 15,
                  padding: "6px 16px",
                  borderRadius: "999px",
                  background: "rgba(123, 143, 204, 0.15)",
                  border: "1px solid rgba(123, 143, 204, 0.3)",
                  color: "#5B9BFF",
                }}
              >
                {tag}
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 16,
              color: "#3B7BF7",
              letterSpacing: "0.08em",
            }}
          >
            project
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
