"use client";

import { useState, useEffect, useCallback } from "react";
import type { Location, Summary } from "../types";
import { fetchLocations, createLocation, editLocation, removeLocation } from "../actions";

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "checked" | "uncheck">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLocations();
      setLocations(data);
    } catch (err) {
      console.error("加载位置失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (data: { name: string; address: string; longitude: number; latitude: number; comments?: string }) => {
    const newLoc = await createLocation(data);
    setLocations((prev) => [...prev, newLoc]);
    return newLoc;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Location>) => {
    const updated = await editLocation(id, data);
    setLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await removeLocation(id);
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
  }, []);

  const filteredLocations = locations
    .filter((loc) => !loc.deleted)
    .filter((loc) => {
      if (filter === "checked") return loc.checked;
      if (filter === "uncheck") return !loc.checked;
      return true;
    });

  const activeLocations = locations.filter((l) => !l.deleted);
  const summary: Summary = {
    uncheckCount: activeLocations.filter((l) => !l.checked).length,
    uncheckPercentage: 0,
    checkedCount: activeLocations.filter((l) => l.checked).length,
    checkedPercentage: 0,
    count: activeLocations.length,
  };
  if (summary.count > 0) {
    summary.uncheckPercentage = Math.floor((summary.uncheckCount / summary.count) * 100);
    summary.checkedPercentage = Math.floor((summary.checkedCount / summary.count) * 100);
  }

  return { locations: filteredLocations, loading, filter, setFilter, load, add, update, remove, summary };
}
