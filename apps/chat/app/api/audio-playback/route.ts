import { getSafeSession } from "@/lib/auth";
import {
  deleteAudioPlaybackState,
  getAudioPlaybackState,
  upsertAudioPlaybackState,
} from "@/lib/db/queries";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json(null);
  }
  const state = await getAudioPlaybackState({ userId: session.user.id });
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = await req.json();
  await upsertAudioPlaybackState({
    userId: session.user.id,
    audioSrc: body.audioSrc,
    slug: body.slug,
    title: body.title,
    currentTime: Math.round(body.currentTime),
    duration: Math.round(body.duration),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await deleteAudioPlaybackState({ userId: session.user.id });
  return NextResponse.json({ ok: true });
}
