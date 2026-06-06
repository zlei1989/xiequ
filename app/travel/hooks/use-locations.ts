"use client";

import { useState, useCallback } from "react";
import type { Location, Summary } from "../types";

/**
 * 位置列表 hook（含筛选、排序）
 * 后续实现时连接 Server Actions / OSS 数据
 */
export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "checked" | "uncheck">("all");

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取位置列表
    setLoading(false);
  }, []);

  const add = useCallback(async (data: Partial<Location>) => {
    // TODO: 调用 Server Action 新增位置
  }, []);

  const update = useCallback(async (id: string, data: Partial<Location>) => {
    // TODO: 调用 Server Action 更新位置
  }, []);

  const remove = useCallback(async (id: string) => {
    // TODO: 调用 Server Action 删除位置
  }, []);

  const filteredLocations = locations.filter((loc) => {
    if (loc.deleted) return false;
    if (filter === "checked") return loc.checked;
    if (filter === "uncheck") return !loc.checked;
    return true;
  });

  const summary: Summary = {
    uncheckCount: locations.filter((l) => !l.deleted && !l.checked).length,
    uncheckPercentage: 0,
    checkedCount: locations.filter((l) => !l.deleted && l.checked).length,
    checkedPercentage: 0,
    count: locations.filter((l) => !l.deleted).length,
  };
  if (summary.count > 0) {
    summary.uncheckPercentage = Math.floor((summary.uncheckCount / summary.count) * 100);
    summary.checkedPercentage = Math.floor((summary.checkedCount / summary.count) * 100);
  }

  return { locations: filteredLocations, loading, filter, setFilter, load, add, update, remove, summary };
}
