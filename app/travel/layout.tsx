"use client";

import { Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { DotLoading } from "antd-mobile";
import { useLocations, TravelContext } from "./hooks/use-locations";
import { TravelShell } from "./components/travel-shell";

function TravelLayoutInner({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();

  const filterParam = searchParams.get("filter") as "checked" | "uncheck" | null;
  const filter: "all" | "checked" | "uncheck" = filterParam || "all";

  const data = useLocations(filter);

  return (
    <TravelContext.Provider value={data}>
      {data.loading && data.locations.length === 0 ? (
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
      ) : (
        <TravelShell>{children}</TravelShell>
      )}
    </TravelContext.Provider>
  );
}

export default function TravelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
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
      }
    >
      <TravelLayoutInner>{children}</TravelLayoutInner>
    </Suspense>
  );
}
