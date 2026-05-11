import { NextResponse } from "next/server";
import { getVolumeTimeseries } from "@/lib/db/queries";

const VALID_BUCKETS = ["hour", "day"] as const;
const VALID_WINDOWS = ["24h", "7d", "30d"] as const;
type Bucket = (typeof VALID_BUCKETS)[number];
type Window = (typeof VALID_WINDOWS)[number];

export const revalidate = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bucket = (url.searchParams.get("bucket") ?? "hour") as Bucket;
  const since = (url.searchParams.get("since") ?? "24h") as Window;

  if (!VALID_BUCKETS.includes(bucket)) {
    return NextResponse.json(
      {
        error: `Invalid bucket (allowed: ${VALID_BUCKETS.join(", ")})`,
        code: "invalid_payload",
      },
      { status: 400 },
    );
  }
  if (!VALID_WINDOWS.includes(since)) {
    return NextResponse.json(
      {
        error: `Invalid since for volume (allowed: ${VALID_WINDOWS.join(", ")})`,
        code: "invalid_payload",
      },
      { status: 400 },
    );
  }

  const result = await getVolumeTimeseries({ bucket, since });
  return NextResponse.json(result);
}
