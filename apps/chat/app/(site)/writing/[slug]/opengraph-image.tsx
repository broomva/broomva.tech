import { ImageResponse } from "next/og";
import { getContentBySlug, getAllSlugs } from "@/lib/content";

export const alt = "broomva.tech";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  const slugs = await getAllSlugs("writing");
  return slugs.map((slug) => ({ slug }));
}

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await getContentBySlug("writing", slug);

  const calSansData = await fetch(
    new URL("../../../../public/fonts/CalSans-SemiBold.ttf", import.meta.url),
  ).then((res) => res.arrayBuffer());

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
          background: "linear-gradient(145deg, #000B18 0%, #001F3F 40%, #0A3D8F 80%, #001F3F 100%)",
          fontFamily: "CalSans",
          color: "#e2e0f0",
        }}
      >
        {/* Top: site name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: 22,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: "#5B9BFF",
          }}
        >
          broomva.tech
        </div>

        {/* Middle: title + summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              fontSize: title.length > 60 ? 42 : 52,
              lineHeight: 1.15,
              fontFamily: "CalSans",
              color: "#ffffff",
              maxWidth: "1050px",
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

        {/* Bottom: tags + writing label */}
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
                  background: "rgba(59, 123, 247, 0.15)",
                  border: "1px solid rgba(59, 123, 247, 0.3)",
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
            writing
          </div>
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
