/**
 * GPIO 参数解析工具
 *
 * 从 URL 查询参数中解析 ESP32 固件上报的传感器和负载原始值。
 * 遵循固件协议：传感器以 sensor:{gpioKey} 上报，负载以 load:{gpioKey} 上报。
 *
 * 解析规则：
 * - `sensor:button_x`（按钮）→ sensors["button_x"] = parseInt(value) || 0
 * - `sensor:sensor_x`（传感器）→ sensors["sensor_x"] = parseInt(value) || 0
 * - `load:load_x`（负载）→ loads["load_x"] = parseInt(value) || 0
 *
 * 值域：
 * - 数字传感器：0/1（低/高电平）
 * - 模拟传感器：0~4095（ESP32 12 位 ADC 原始值）
 * - 负载：0~255（PWM）/ 0~4095（DAC）
 *
 * @param searchParams - 请求 URL 查询参数
 * @returns 解析后的 sensors 和 loads 字典
 */
export function parseGpioParams(searchParams: URLSearchParams): {
  sensors: Record<string, number>;
  loads: Record<string, number>;
} {
  const result: {
    sensors: Record<string, number>;
    loads: Record<string, number>;
  } = { sensors: {}, loads: {} };

  searchParams.forEach((value, key) => {
    const match = key.match(/^(sensor|load):(.+)$/);
    if (match) {
      const category = match[1] === 'sensor' ? 'sensors' : 'loads';
      const gpioKey = match[2];
      if (gpioKey) {
        result[category][gpioKey] = parseInt(value) || 0;
      }
    }
  });

  return result;
}
