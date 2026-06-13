/**
 * 旅行计划模块类型定义
 *
 * 核心实体：Location（位置）、Moment（精彩瞬间）、Summary（概览统计）、Route（路线）、RouteMarker（路线标注）、RouteEntry（路线条目）。
 * 数据持久化在腾讯云 COS，通过 OSS 适配器读写。
 */

/** 位置 — 旅途中标记的一个地点 */
export type Location = {
  /** 唯一标识（8 位字母数字） */
  id: string;
  /** 地点名称 */
  name: string;
  /** 地址描述 */
  address: string;
  longitude: number;
  latitude: number;
  /** 是否已打卡 */
  checked: boolean;
  /** 备注 */
  comments: string;
  /** 封面图 COS 链接 */
  posterUrl?: string;
  /** 软删除标记 */
  deleted: boolean;
  createdTime: string;
  /** 关联的瞬间记录（按 momentId 索引），从 OSS 数据中解析 */
  moments?: Record<string, { date: string; text: string }>;
};

/** 精彩瞬间 — 关联到某个位置的回忆记录 */
export type Moment = {
  id: string;
  locationId: string;
  /** 回忆日期（YYYY-MM-DD） */
  date: string;
  /** 回忆文字 */
  text: string;
  createdTime: string;
};

/** 概览统计 — 用于首页数据卡片 */
export type Summary = {
  uncheckCount: number;
  uncheckPercentage: number;
  checkedCount: number;
  checkedPercentage: number;
  /** 未删除位置总数 */
  count: number;
};

/** 路线标注点 */
export type RouteMarker = {
  /** 对应位置 ID */
  locationId: string;
  /** 位置名称 */
  name: string;
  /** 经度 */
  longitude: number;
  /** 纬度 */
  latitude: number;
  /** 该地点在本段路线中的瞬间条数 */
  momentCount: number;
};

/** 路线中的单个瞬间条目（未去重，用于位置列表面板） */
export type RouteEntry = {
  /** 对应位置 ID */
  locationId: string;
  /** 位置名称 */
  name: string;
  /** 经度 */
  longitude: number;
  /** 纬度 */
  latitude: number;
  /** 瞬间日期（YYYY-MM-DD） */
  date: string;
};

/** 一段旅行路线 */
export type Route = {
  /** 唯一标识，由 startDate 生成（如 "route-2024-01-01"） */
  id: string;
  /** 路线中的标注点（时间顺序排列，去重后的地点） */
  markers: RouteMarker[];
  /** 按最近邻排序后的坐标序列，用作 polyline path */
  polyline: [number, number][];
  /** 开始日期（YYYY-MM-DD） */
  startDate: string;
  /** 结束日期（YYYY-MM-DD） */
  endDate: string;
  /** 持续天数，含头含尾（endDate - startDate + 1） */
  days: number;
  /** 路线中去重后的位置数量 */
  locationCount: number;
  /** 起点地名 */
  startName: string;
  /** 终点地名 */
  endName: string;
  /** 按时间+空间排序后的瞬间条目（未去重，含日期，供位置列表面板使用） */
  entries: RouteEntry[];
};
