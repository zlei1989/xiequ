"use client";

import { useState, useEffect, useCallback } from "react";
import type { Moment } from "../types";
import { fetchLocations } from "../actions";
import { createMoment, editMoment, removeMoment } from "../actions";

export function useMoments(locationId: string) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const locations = await fetchLocations();
      const location = locations.find((l) => l.id === locationId);
      if (location && (location as any).moments) {
        const momentsMap = (location as any).moments as Record<string, { date: string; text: string }>;
        const items: Moment[] = Object.entries(momentsMap).map(([id, m]) => ({
          id,
          locationId,
          date: m.date,
          text: m.text,
          createdTime: "",
        }));
        items.sort((a, b) => b.date.localeCompare(a.date));
        setMoments(items);
      }
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (data: { date: string; text: string }) => {
    await createMoment(locationId, data);
    await load();
  }, [locationId, load]);

  const update = useCallback(async (id: string, data: { date?: string; text?: string }) => {
    await editMoment(locationId, id, data);
    await load();
  }, [locationId, load]);

  const remove = useCallback(async (id: string) => {
    await removeMoment(locationId, id);
    await load();
  }, [locationId, load]);

  return { moments, loading, load, add, update, remove };
}
