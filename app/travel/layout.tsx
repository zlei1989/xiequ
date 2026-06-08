"use client";

import { Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { DotLoading } from "antd-mobile";
import { useLocations, TravelContext } from "./hooks/use-locations";
import { Shell } from "./components/shell";

function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <DotLoading />
    </div>
  );
}

function TravelLayoutInner({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter") as "checked" | "uncheck" | null;
  const filter: "all" | "checked" | "uncheck" = filterParam || "all";
  const data = useLocations(filter);

  return (
    <TravelContext.Provider value={data}>
      {data.loading && data.locations.length === 0 ? (
        <LoadingScreen />
      ) : (
        <Shell>{children}</Shell>
      )}
    </TravelContext.Provider>
  );
}

export default function TravelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TravelLayoutInner>{children}</TravelLayoutInner>
    </Suspense>
  );
}
