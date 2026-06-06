"use client";

import { useState, useCallback, useRef } from "react";

// ---- Types ----

export type GpioState = {
  buttons: Record<string, number>;
  sensors: Record<string, number>;
  loads: Record<string, number>;
};

export type DeviceIdentity = {
  chipId: string;
  macAddress: string;
  stateId: string;
};

export type LogEntry = {
  id: number;
  timestamp: string;
  direction: "request" | "response";
  url: string;
  method: string;
  body?: string;
  status?: number;
  error?: string;
};

// Default GPIO values matching the ESP32 firmware's 4-pump setup
const DEFAULT_GPIO: GpioState = {
  buttons: { button_0: 0, button_1: 0, button_2: 0, button_3: 0, button_4: 0 },
  sensors: { sensor_0: 1827, sensor_1: 0, sensor_2: 0, sensor_3: 0, sensor_4: 355 },
  loads: { load_0: 0, load_1: 0, load_2: 0, load_3: 0 },
};

// ---- Hook ----

export function useIotSimulator() {
  const [identity, setIdentity] = useState<DeviceIdentity>({
    chipId: "5872424",
    macAddress: "20:E7:C8:59:9B:28",
    stateId: "",
  });
  const [gpio, setGpio] = useState<GpioState>(DEFAULT_GPIO);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const nextId = useRef(0);

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs((prev) => [
      { ...entry, id: nextId.current++, timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }) },
      ...prev,
    ]);
  }, []);

  /**
   * Build the query string matching the ESP32 firmware's NetworkExt.getStateQuery() order:
   * 1. Base fields: macAddress, chipId
   * 2. Custom params: event, stateId, cause, type, message, etc.
   * 3. Component states: buttons as sensor:button_x, sensors as sensor:sensor_x, loads as load:load_x
   */
  const buildQuery = useCallback(
    (extra: Record<string, string> = {}): string => {
      const params = new URLSearchParams();
      params.set("macAddress", identity.macAddress);
      params.set("chipId", identity.chipId);

      // Extra params (event, stateId, cause, type, message, etc.)
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== "") {
          params.set(k, v);
        }
      }

      // Buttons: firmware sends them as sensor:button_x because
      // they are registered as TYPE_SENSOR in Process
      for (const [key, val] of Object.entries(gpio.buttons)) {
        params.set(`sensor:${key}`, String(val));
      }
      // Sensors: sensor:sensor_x
      for (const [key, val] of Object.entries(gpio.sensors)) {
        params.set(`sensor:${key}`, String(val));
      }
      // Loads: load:load_x
      for (const [key, val] of Object.entries(gpio.loads)) {
        params.set(`load:${key}`, String(val));
      }

      return params.toString();
    },
    [identity, gpio]
  );

  /** Fire a GET request to a local Next.js IoT API route */
  const sendRequest = useCallback(
    async (endpoint: string, extra: Record<string, string> = {}) => {
      const query = buildQuery(extra);
      const url = `/watering/api/${endpoint}?${query}`;

      addLog({ direction: "request", url, method: "GET" });
      setLoading(true);

      try {
        const res = await fetch(url);
        const text = await res.text();
        let body: string;
        try {
          body = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          body = text;
        }
        addLog({ direction: "response", url, method: "GET", status: res.status, body });

        // If getState response contains stateId, auto-update it
        if (endpoint === "get-state") {
          try {
            const json = JSON.parse(text);
            if (json?.data?.stateId) {
              setIdentity((prev) => ({ ...prev, stateId: json.data.stateId }));
            }
          } catch {
            // ignore
          }
        }
      } catch (err: any) {
        addLog({ direction: "response", url, method: "GET", error: err.message });
      } finally {
        setLoading(false);
      }
    },
    [buildQuery, addLog]
  );

  // Convenience methods matching the IoT protocol events

  const getState = useCallback(() => {
    return sendRequest("get-state", { stateId: identity.stateId });
  }, [sendRequest, identity.stateId]);

  const pushBootstrap = useCallback(
    (cause = "0") => {
      return sendRequest("push-state", { event: "bootstrap", cause });
    },
    [sendRequest]
  );

  const pushChange = useCallback(
    (type: string, message = "") => {
      const extra: Record<string, string> = {
        event: "change",
        stateId: identity.stateId,
        type,
      };
      if (message) {
        extra.message = message;
      }
      return sendRequest("push-state", extra);
    },
    [sendRequest, identity.stateId]
  );

  const pushFinish = useCallback(() => {
    return sendRequest("push-state", { event: "finish", stateId: identity.stateId });
  }, [sendRequest, identity.stateId]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return {
    identity,
    setIdentity,
    gpio,
    setGpio,
    logs,
    loading,
    // Actions
    getState,
    pushBootstrap,
    pushChange,
    pushFinish,
    clearLogs,
  };
}
