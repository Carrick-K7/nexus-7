"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const HUMAN_ENDPOINT = "/api/research/v1/human";
const INTERVAL_MS = 30_000;
const TIMEOUT_MS = 15_000;
export type ReadError = "unauthorized" | "invalid" | "unavailable";
type Request = { controller: AbortController; timeout: number | null };

/** A read is never a work trigger. Hidden/unmounted pages cancel their request. */
export function useReadOnlySnapshot<T>(parse: (value: unknown) => T | null) {
  const [snapshot, setSnapshot] = useState<T | null>(null);
  const [error, setError] = useState<ReadError | null>(null);
  const [reading, setReading] = useState(true);
  const active = useRef<Request | null>(null);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible" || active.current) return;
    const request: Request = { controller: new AbortController(), timeout: null };
    active.current = request;
    setReading(true);
    request.timeout = window.setTimeout(() => {
      if (active.current !== request) return;
      active.current = null;
      request.controller.abort();
      setReading(false);
      setError("unavailable");
    }, TIMEOUT_MS);
    try {
      const response = await fetch(HUMAN_ENDPOINT, {
        method: "GET", cache: "no-store", credentials: "same-origin", signal: request.controller.signal,
      });
      if (active.current !== request) return;
      if (!response.ok) {
        setError(response.status === 401 || response.status === 403 ? "unauthorized" : "unavailable");
        return;
      }
      const payload: unknown = await response.json();
      if (active.current !== request) return;
      const next = parse(payload);
      if (!next) { setError("invalid"); return; }
      setSnapshot(next);
      setError(null);
    } catch {
      if (active.current === request) setError("unavailable");
    } finally {
      if (request.timeout !== null) window.clearTimeout(request.timeout);
      if (active.current === request) {
        active.current = null;
        setReading(false);
      }
    }
  }, [parse]);

  useEffect(() => {
    function cancel() {
      const request = active.current;
      active.current = null;
      if (request?.timeout !== null && request?.timeout !== undefined) window.clearTimeout(request.timeout);
      request?.controller.abort();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") void refresh();
      else { cancel(); setReading(false); }
    }
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      cancel();
    };
  }, [refresh]);

  return { snapshot, error, reading, refresh };
}
