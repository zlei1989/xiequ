"use client";

import type { CSSProperties, ReactNode } from "react";
import { Image } from "antd-mobile";

export function CoverImage({
  src,
  alt,
  width = "100%",
  height = 200,
  fit = "cover",
  shape = "rounded",
  fallback,
}: {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  shape?: "rounded" | "circle";
  fallback?: ReactNode;
}) {
  const style: CSSProperties = {
    borderRadius: shape === "circle" ? "50%" : undefined,
  };

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      fit={fit}
      style={style}
      fallback={fallback}
      lazy
    />
  );
}
