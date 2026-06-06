"use server";

import {
  getLocations,
  addLocation,
  updateLocation,
  deleteLocation,
  addMoment,
  updateMoment,
  deleteMoment,
  getCoverUploadUrl,
  getCoverDownloadUrl,
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
 * 前端拿到签名 URL 后直接 PUT 上传到 COS。
 * 参考 TencentOss.getSignedPutUrl() 流程：
 * 1. Server Action 返回签名 URL
 * 2. 前端使用 fetch(url, { method: 'PUT', body: file }) 直传
 */
export async function getUploadUrl(id: string, type: "cover" | "icon" = "cover") {
  return getCoverUploadUrl(id);
}

/**
 * 获取图片下载签名 URL
 *
 * 服务端生成临时访问地址返回给前端。
 * 签名 URL 由 OssAdapter.getSignedUrl() 生成。
 */
export async function getImageUrl(id: string, type: "cover" | "icon" = "cover") {
  return getCoverDownloadUrl(id);
}
