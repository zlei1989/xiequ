import { describe, it, expect } from "vitest";
import { filterLocations } from "@/app/travel/lib/filter-locations";
import type { Location } from "@/app/travel/types";

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "1",
    name: "故宫",
    address: "北京市东城区",
    longitude: 116.4,
    latitude: 39.9,
    checked: false,
    comments: "值得去",
    deleted: false,
    createdTime: "2026-01-01",
    ...overrides,
  };
}

const locations: Location[] = [
  makeLocation({ id: "1", name: "故宫", address: "北京市东城区", comments: "值得去" }),
  makeLocation({ id: "2", name: "长城", address: "北京市延庆区", comments: "" }),
  makeLocation({ id: "3", name: "西湖", address: "杭州市西湖区", comments: "很美" }),
];

describe("filterLocations", () => {
  it("returns all locations when keyword is empty string", () => {
    expect(filterLocations(locations, "")).toEqual(locations);
  });

  it("returns all locations when keyword is only whitespace", () => {
    expect(filterLocations(locations, "   ")).toEqual(locations);
  });

  it("matches by name (exact)", () => {
    const result = filterLocations(locations, "故宫");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("matches by name (partial)", () => {
    const result = filterLocations(locations, "长");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("matches by address", () => {
    const result = filterLocations(locations, "杭州");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("matches by comments", () => {
    const result = filterLocations(locations, "值得");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("matches across multiple locations", () => {
    const result = filterLocations(locations, "北京");
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.id).sort()).toEqual(["1", "2"]);
  });

  it("is case insensitive", () => {
    const mixed = [
      makeLocation({ id: "1", name: "Gugong", address: "Beijing", comments: "" }),
    ];
    expect(filterLocations(mixed, "gugong")).toHaveLength(1);
    expect(filterLocations(mixed, "beijing")).toHaveLength(1);
  });

  it("returns empty array when no match", () => {
    const result = filterLocations(locations, "不存在的");
    expect(result).toEqual([]);
  });

  it("handles undefined comments gracefully", () => {
    const loc = makeLocation({ id: "1", name: "test", comments: "" });
    const result = filterLocations([loc], "keyword");
    // "" includes "keyword" → false, no crash
    expect(result).toEqual([]);
  });
});
