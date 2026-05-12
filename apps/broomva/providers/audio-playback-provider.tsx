"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PlaybackState = "idle" | "playing" | "paused";

type AudioTrack = {
  audioSrc: string;
  slug: string;
  title: string;
};

type AudioPlaybackContextValue = {
  track: AudioTrack | null;
  state: PlaybackState;
  currentTime: number;
  duration: number;
  progress: number;
  play: (track: AudioTrack, startTime?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
  skip: (seconds: number) => void;
};

const COOKIE_KEY = "audio-playback";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SYNC_DEBOUNCE_MS = 5000;

/**
 * Cache-bust audio URLs after the Lago migration.
 *
 * Before the migration, /audio/writing/*.mp3 was served as a committed static
 * file. While the proxy didn't yet allow .mp3 through, the path silently
 * redirected to /login with `Cache-Control: max-age=31536000, immutable` —
 * which browsers cached for a year. Even after the proxy fix shipped, those
 * users keep hitting their stuck cached redirect instead of the live 302→Lago.
 *
 * Appending a query string forces a fresh request that misses the bad cache
 * entry. Bump this value if a future migration creates a similar stuck-cache
 * scenario.
 */
const AUDIO_CACHE_VERSION = "lago-2026-05-12";

function withCacheBust(audioSrc: string): string {
  if (!audioSrc) return audioSrc;
  // Don't append if the caller already supplied a query string.
  if (audioSrc.includes("?")) return audioSrc;
  return `${audioSrc}?v=${AUDIO_CACHE_VERSION}`;
}

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(
  null,
);

type PersistedState = {
  audioSrc: string;
  slug: string;
  title: string;
  currentTime: number;
  duration: number;
};

function readCookie(): PersistedState | null {
  if (typeof document === "undefined") return null;
  try {
    const match = `; ${document.cookie}`.split(`; ${COOKIE_KEY}=`);
    if (match.length < 2) return null;
    const raw = match[1]?.split(";")[0];
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw)) as PersistedState;
  } catch {
    return null;
  }
}

function writeCookie(state: PersistedState | null) {
  if (typeof document === "undefined") return;
  if (!state) {
    // biome-ignore lint/suspicious/noDocumentCookie: direct cookie API
    document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0`;
    return;
  }
  const encoded = encodeURIComponent(JSON.stringify(state));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: direct cookie API
  document.cookie = `${COOKIE_KEY}=${encoded}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

async function syncToServer(state: PersistedState) {
  try {
    await fetch("/api/audio-playback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // silent fail -- cookie is the fallback
  }
}

async function fetchFromServer(): Promise<PersistedState | null> {
  try {
    const res = await fetch("/api/audio-playback");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.audioSrc) return null;
    return data as PersistedState;
  } catch {
    return null;
  }
}

async function clearServer() {
  try {
    await fetch("/api/audio-playback", { method: "DELETE" });
  } catch {
    // silent
  }
}

export function AudioPlaybackProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [state, setState] = useState<PlaybackState>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "metadata";
    }
    return audioRef.current;
  }, []);

  const persistState = useCallback(() => {
    if (!track) return;
    const audio = audioRef.current;
    const rawDuration = audio?.duration ?? 0;
    const rawTime = audio?.currentTime ?? 0;
    const persisted: PersistedState = {
      audioSrc: track.audioSrc,
      slug: track.slug,
      title: track.title,
      currentTime: Number.isFinite(rawTime) ? rawTime : 0,
      duration: Number.isFinite(rawDuration) ? rawDuration : 0,
    };
    writeCookie(persisted);

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncToServer(persisted);
    }, SYNC_DEBOUNCE_MS);
  }, [track]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const cookieState = readCookie();
    if (cookieState) {
      setTrack({
        audioSrc: cookieState.audioSrc,
        slug: cookieState.slug,
        title: cookieState.title,
      });
      const audio = getAudio();
      audio.src = withCacheBust(cookieState.audioSrc);
      audio.currentTime = cookieState.currentTime || 0;
      setCurrentTime(cookieState.currentTime || 0);
      setDuration(cookieState.duration || 0);
      setState("paused");
    }

    fetchFromServer().then((serverState) => {
      if (!serverState) return;
      const local = readCookie();
      const serverNewer =
        !local ||
        serverState.audioSrc !== local.audioSrc ||
        (serverState.currentTime || 0) > (local.currentTime || 0);
      if (serverNewer) {
        setTrack({
          audioSrc: serverState.audioSrc,
          slug: serverState.slug,
          title: serverState.title,
        });
        const audio = getAudio();
        const targetSrc = withCacheBust(serverState.audioSrc);
        if (audio.src !== targetSrc) {
          audio.src = targetSrc;
        }
        audio.currentTime = serverState.currentTime || 0;
        setCurrentTime(serverState.currentTime || 0);
        setDuration(serverState.duration || 0);
        setState("paused");
        writeCookie(serverState);
      }
    });
  }, [getAudio]);

  useEffect(() => {
    const audio = getAudio();
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0)
        setDuration(audio.duration);
    };
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0)
        setDuration(audio.duration);
    };
    const onPlay = () => setState("playing");
    const onPause = () => {
      if (audio.ended) {
        setState("idle");
        setCurrentTime(0);
        writeCookie(null);
        clearServer();
      } else {
        setState("paused");
        persistState();
      }
    };
    const onEnded = () => {
      setState("idle");
      setTrack(null);
      setCurrentTime(0);
      setDuration(0);
      writeCookie(null);
      clearServer();
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [getAudio, persistState]);

  useEffect(() => {
    const handleBeforeUnload = () => persistState();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [persistState]);

  const play = useCallback(
    (newTrack: AudioTrack, startTime?: number) => {
      const audio = getAudio();
      const sameSrc =
        track?.audioSrc === newTrack.audioSrc && audio.src.includes(newTrack.audioSrc);

      setTrack(newTrack);

      if (!sameSrc) {
        audio.src = withCacheBust(newTrack.audioSrc);
        audio.load();
      }

      if (startTime !== undefined) {
        audio.currentTime = startTime;
      }
      audio.play().catch(() => {});
    },
    [getAudio, track],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setState("idle");
    setTrack(null);
    setCurrentTime(0);
    setDuration(0);
    writeCookie(null);
    clearServer();
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
  }, []);

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(
      0,
      Math.min(audio.currentTime + seconds, audio.duration || 0),
    );
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const value = useMemo<AudioPlaybackContextValue>(
    () => ({
      track,
      state,
      currentTime,
      duration,
      progress,
      play,
      pause,
      resume,
      stop,
      seek,
      skip,
    }),
    [track, state, currentTime, duration, progress, play, pause, resume, stop, seek, skip],
  );

  return (
    <AudioPlaybackContext.Provider value={value}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

export function useAudioPlayback(): AudioPlaybackContextValue {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx) {
    throw new Error(
      "useAudioPlayback must be used within an AudioPlaybackProvider",
    );
  }
  return ctx;
}
