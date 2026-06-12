/**
 * 旅行计划模块类型定义
 *
 * 核心实体：Location（位置）、Moment（精彩瞬间）、Summary（概览统计）。
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
