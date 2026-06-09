"use server";

import {
  getLocations,
  addLocation,
  updateLocation,
  deleteLocation,
  addMoment,
  updateMoment,
  deleteMoment,
  getPosterUploadUrl,
  getPosterStyledUrl,
} from "./services/oss";
import { isOssConfigured } from "@/lib/oss";

export async function fetchLocations() {
  if (!isOssConfigured()) {
    return [];
  }
  return getLocations();
}

export async function createLocation(data: {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  comments?: string;
}) {
  return addLocation(data);
}

export async function editLocation(id: string, data: Partial<import("./types").Location>) {
  return updateLocation(id, data);
}

export async function removeLocation(id: string) {
  return deleteLocation(id);
}

export async function createMoment(locationId: string, data: { date: string; text: string }) {
  return addMoment(locationId, data);
}

export async function editMoment(locationId: string, momentId: string, data: { date?: string; text?: string }) {
  return updateMoment(locationId, momentId, data);
}

export async function removeMoment(locationId: string, momentId: string) {
  return deleteMoment(locationId, momentId);
}

/**
 * 获取图片上传签名 URL
 *
 * 前端拿到签名 URL 后直接 PUT 上传到 COS 的 apps/travel/posters/{id}.jpg。
 */
export async function getUploadUrl(id: string, type: "cover" | "icon" = "cover") {
  return getPosterUploadUrl(id);
}

/**
 * 获取图片访问 URL（COS CI 样式处理）
 *
 * 返回带样式后缀的公共访问地址：
 * https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{type}
 */
export async function getImageUrl(id: string, type: "cover" | "icon" = "cover") {
  return getPosterStyledUrl(id, type);
}
