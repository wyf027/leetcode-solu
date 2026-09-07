import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CodexQuota } from "./types";

const UNAVAILABLE: CodexQuota = { state: "unavailable" };

export function useCodexQuota(panelOpen: boolean) {
  const [quota, setQuota] = useState<CodexQuota>(UNAVAILABLE);
  const mounted = useRef(false);
  const requestInFlight = useRef<Promise<CodexQuota> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const requestQuota = useCallback(
    (forceRefresh: boolean, reuseInFlight: boolean) => {
      if (requestInFlight.current) {
        return reuseInFlight ? requestInFlight.current : null;
      }

      const request = invoke<CodexQuota>("get_codex_quota", {
        forceRefresh,
      });
      requestInFlight.current = request;
      const clearRequest = () => {
        if (requestInFlight.current === request) {
          requestInFlight.current = null;
        }
      };
      void request.then(clearRequest, clearRequest);
      return request;
    },
    [],
  );

  useEffect(() => {
    if (!panelOpen) {
      return undefined;
    }

    let active = true;
    const request = requestQuota(false, true);
    void request
      ?.then((nextQuota) => {
        if (active) {
          setQuota(nextQuota);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [panelOpen, requestQuota]);

  const refresh = useCallback(() => {
    const request = requestQuota(true, false);
    void request
      ?.then((nextQuota) => {
        if (!mounted.current) {
          return;
        }

        setQuota((currentQuota) => {
          if (
            nextQuota.state === "unavailable" &&
            currentQuota.state === "available"
          ) {
            return currentQuota;
          }
          return nextQuota;
        });
      })
      .catch(() => {
        // Keep the last rendered value when a refresh cannot be completed.
      });
  }, [requestQuota]);

  return { quota, refresh };
}
