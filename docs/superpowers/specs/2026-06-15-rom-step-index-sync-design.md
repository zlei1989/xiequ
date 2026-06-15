# ROM 步骤索引同步修复

## 问题

ROM 自主切换步骤（超时/中断/正常结束）时，`stepIndex` 不上报服务端，导致前端 `StepProgress` 组件无法同步展示 ROM 的当前步骤。

### 根因 1：JSON 值类型过滤

`NetworkExt::getStateQuery()` 序列化 JSON 字段为 URL 查询参数时，只处理 `const char*` 类型。`stepIndex` 是 `int` 类型，被静默跳过，从未发送到服务端。

### 根因 2：服务端无条件覆盖（竞态隐患）

`push-state/route.ts` 的 `change` 分支无条件写入 `stepIndex`。若 ROM 的 invoke 队列中有旧 change 事件（携带旧 `stateId`），可能在用户手动切换步骤之后到达服务端，覆盖新的 `stepIndex`。

## 设计

### 改动 1：NetworkExt.cpp — 扩展值类型序列化

**位置**：`getStateQuery()` 中第二步（submitFields）和第三步（stateFields）的序列化循环。

**内容**：将单一 `is<const char*>()` 判断扩展为 `string / int / bool / float` 四种类型支持：

```cpp
String value;
if (kv.value().is<const char *>()) {
  value = kv.value().as<String>();
} else if (kv.value().is<int>()) {
  value = String(kv.value().as<int>());
} else if (kv.value().is<bool>()) {
  value = String(kv.value().as<bool>() ? 1 : 0);
} else if (kv.value().is<float>()) {
  value = String(kv.value().as<float>());
} else {
  continue;
}
```

### 改动 2：push-state/route.ts — stateId 校验防覆盖

**位置**：`change` 事件处理中写入 `stepIndex` 的逻辑。

**内容**：比对 ROM 上报的 `stateId` 与 DB 中当前 `stateId`，仅匹配时才接受写入：

```typescript
if (state && state.stateId === stateId) {
  state.stepIndex = parseInt(stepIndex, 10);
  await saveDeviceState(state);
}
```

## 影响

- ROM 步骤变化（step_begin/step_end/step_timeout/step_interrupt）正确上报 `stepIndex`
- 前端 `StepProgress` 在 15s 轮询周期内展示 ROM 当前步骤
- 用户手动切换步骤不被 ROM 延迟事件覆盖
- 其他非字符串字段未来不再受此限制
