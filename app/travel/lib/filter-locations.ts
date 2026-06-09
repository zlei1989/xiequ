import type { Location } from "../types";

export function filterLocations(
  locations: Location[],
  keyword: string
): Location[] {
  if (!keyword.trim()) return locations;

  const kw = keyword.toLowerCase();
  return locations.filter((loc) => {
    return (
      loc.name.toLowerCase().includes(kw) ||
      loc.address.toLowerCase().includes(kw) ||
      (loc.comments || "").toLowerCase().includes(kw)
    );
  });
}
