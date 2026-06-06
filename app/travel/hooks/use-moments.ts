"use client";

import { useState, useCallback } from "react";
import type { Moment } from "../types";

/**
 * 精彩瞬间 CRUD hook
 * 后续实现时连接 Server Actions / OSS 数据
 */
export function useMoments(locationId: string) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取瞬间列表
    setLoading(false);
  }, [locationId]);

  const add = useCallback(async (data: { date: string; text: string }) => {
    // TODO: 调用 Server Action 新增瞬间
  }, [locationId]);

  const update = useCallback(async (id: string, data: { date?: string; text?: string }) => {
    // TODO: 调用 Server Action 更新瞬间
  }, [locationId]);

  const remove = useCallback(async (id: string) => {
    // TODO: 调用 Server Action 删除瞬间
  }, [locationId]);

  return { moments, loading, load, add, update, remove };
}
