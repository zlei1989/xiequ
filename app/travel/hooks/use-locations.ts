"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Location, Summary } from "../types";
import { fetchLocations, createLocation, editLocation, removeLocation } from "../actions";

export type TravelData = {
  locations: Location[];
  sortedLocations: Location[];
  summary: Summary;
  loading: boolean;
  add: (data: { name: string; address: string; longitude: number; latitude: number; comments?: string }) => Promise<Location>;
  update: (id: string, data: Partial<Location>) => Promise<Location>;
  remove: (id: string) => Promise<void>;
  load: () => Promise<void>;
};

export const TravelContext = createContext<TravelData | null>(null);

export function useTravelContext() {
  const ctx = useContext(TravelContext);
  if (!ctx) throw new Error("useTravelContext must be used within TravelContext.Provider");
  return ctx;
}

export function useLocations(filter?: "all" | "checked" | "uncheck") {
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLocations();
      setAllLocations(data);
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
    setAllLocations((prev) => [...prev, newLoc]);
    return newLoc;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Location>) => {
    const updated = await editLocation(id, data);
    setAllLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await removeLocation(id);
    setAllLocations((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
  }, []);

  // 过滤后的列表
  const filteredLocations = allLocations
    .filter((loc) => !loc.deleted)
    .filter((loc) => {
      if (filter === "checked") return loc.checked;
      if (filter === "uncheck") return !loc.checked;
      return true;
    });

  // 统计基于所有未删除的位置（对标参考：summary 基于全部数据）
  const activeLocations = allLocations.filter((l) => !l.deleted);
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

  return {
    locations: allLocations,
    sortedLocations: filteredLocations,
    summary,
    loading,
    load,
    add,
    update,
    remove,
  };
}
