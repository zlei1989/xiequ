/**
 * IoT 模拟器 Hook — 模拟 ESP32 固件的 getState/pushState 请求周期
 */

'use client';

import { useState, useCallback, useRef } from 'react';

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
  direction: 'request' | 'response';
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
    chipId: '5872424',
    macAddress: '20:E7:C8:59:9B:28',
    stateId: '',
  });
  const [gpio, setGpio] = useState<GpioState>(DEFAULT_GPIO);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const nextId = useRef(0);

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogs((prev) => [
      { ...entry, id: nextId.current++, timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }) },
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
      params.set('macAddress', identity.macAddress);
      params.set('chipId', identity.chipId);

      // Extra params (event, stateId, cause, type, message, etc.)
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== '') {
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
    [identity, gpio],
  );

  /** Fire a GET request to a local Next.js IoT API route */
  const sendRequest = useCallback(
    async (endpoint: string, extra: Record<string, string> = {}) => {
      const query = buildQuery(extra);
      const url = `/watering/api/${endpoint}?${query}`;

      addLog({ direction: 'request', url, method: 'GET' });
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
        addLog({ direction: 'response', url, method: 'GET', status: res.status, body });

        // 自动更新 stateId — get-state 响应中 stateId 位于顶层，非 data 下
        if (endpoint === 'get-state') {
          try {
            const json = JSON.parse(text);
            if (json?.stateId) {
              setIdentity((prev) => ({ ...prev, stateId: json.stateId }));
            }
          } catch {
            // JSON 解析失败时忽略，stateId 保持旧值
          }
        }
      } catch (err: any) {
        console.error('[Watering Debug] fetch 请求失败:', {
          url,
          error: err instanceof Error ? err.message : String(err),
        });
        if (err instanceof Error && err.stack) console.error(err.stack);
        addLog({ direction: 'response', url, method: 'GET', error: err instanceof Error ? err.message : String(err) });
      } finally {
        setLoading(false);
      }
    },
    [buildQuery, addLog],
  );

  /**
   * 模拟 ESP32 固件的 getState 轮询请求
   *
   * 固件端定期调用此接口获取最新 switch 状态和 process 指令，
   * 传入本地 stateId 供服务端判断是否有变化。
   */
  const getState = useCallback(() => {
    return sendRequest('get-state', { stateId: identity.stateId });
  }, [sendRequest, identity.stateId]);

  /**
   * 模拟 ESP32 上电 bootstrap 事件 — 首次上线时上报 GPIO 状态并触发默认配置创建
   * @param cause 启动原因: "0"=正常上电，"2"=外部唤醒，"4"=定时器唤醒
   */
  const pushBootstrap = useCallback(
    (cause = '0') => {
      return sendRequest('push-state', { event: 'bootstrap', cause });
    },
    [sendRequest],
  );

  /**
   * 模拟 ESP32 步骤变更 change 事件 — 上报当前步骤的执行状态变化
   * @param type 变更类型: step_ready/step_begin/step_end/step_timeout/step_interrupt
   * @param message 可选的附加消息
   */
  const pushChange = useCallback(
    (type: string, message = '') => {
      const extra: Record<string, string> = {
        event: 'change',
        stateId: identity.stateId,
        type,
      };
      if (message) {
        extra.message = message;
      }
      return sendRequest('push-state', extra);
    },
    [sendRequest, identity.stateId],
  );

  /**
   * 模拟 ESP32 流程完成 finish 事件 — 通知服务端当前流程已执行完毕
   */
  const pushFinish = useCallback(() => {
    return sendRequest('push-state', { event: 'finish', stateId: identity.stateId });
  }, [sendRequest, identity.stateId]);

  const clearLogs = useCallback(() => { setLogs([]); }, []);

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
