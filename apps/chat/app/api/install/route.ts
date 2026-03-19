import { NextResponse } from "next/server";

const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/broomva/broomva.tech/main/crates/broomva-cli/install.sh";

export async function GET() {
  const resp = await fetch(INSTALL_SCRIPT_URL, { next: { revalidate: 300 } });

  if (!resp.ok) {
    return new NextResponse("install script unavailable", { status: 502 });
  }

  const script = await resp.text();

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
