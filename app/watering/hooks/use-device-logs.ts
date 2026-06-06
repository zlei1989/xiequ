"use client";

import { useState, useCallback } from "react";
import { getLogs } from "../actions/get-logs";
import { clearLogs } from "../actions/clear-logs";

export function useDeviceLogs(chipId: string) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLogs(chipId);
      setLogs(data as any[]);
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const clear = useCallback(async () => {
    await clearLogs(chipId);
    setLogs([]);
  }, [chipId]);

  return { logs, loading, load, clear };
}
