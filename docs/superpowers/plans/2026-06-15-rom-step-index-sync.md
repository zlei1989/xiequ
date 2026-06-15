# ROM 步骤索引同步修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 ROM 自主切换步骤时 stepIndex 不上报服务端的 bug，同时添加服务端 stateId 校验防止竞态覆盖。

**Architecture:** 两处小改动 — ROM 端 `NetworkExt::getStateQuery()` 扩展 JSON 值类型序列化（string/int/bool/float），服务端 `push-state/route.ts` 的 change 分支添加 stateId 匹配校验。

**Tech Stack:** Arduino C++ (ArduinoJson), Next.js API Routes (TypeScript)

---

### Task 1: ROM 端 — getStateQuery 第二步序列化支持 int

**Files:**
- Modify: `app/watering/rom-v2/NetworkExt.cpp:371-384`

- [ ] **Step 1: 将 submitFields 循环中的类型检查从仅支持 string 改为支持 string/int/bool/float**

将：
```cpp
for (JsonPair kv : submitFields) {
  if (kv.value().is<const char *>() == false) {
    continue;
  }
  const char *keyPtr = kv.key().c_str();
  if (keyPtr == nullptr) { continue; }
  const String key = String(keyPtr);
  if (key.length() == 0) { continue; }
  const String value = kv.value().as<String>();
  String pair = urlEncode(key) + "=" + urlEncode(value);
  query += "&" + pair;
}
```

改为：
```cpp
for (JsonPair kv : submitFields) {
  // 将 JSON 值序列化为字符串，支持 string / int / bool / float 四种类型
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
  // 将 key 转换为 String 避免悬空指针
  const char *keyPtr = kv.key().c_str();
  if (keyPtr == nullptr) { continue; }
  const String key = String(keyPtr);
  if (key.length() == 0) { continue; }
  String pair = urlEncode(key) + "=" + urlEncode(value);
  query += "&" + pair;
}
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/rom-v2/NetworkExt.cpp
git commit -m "fix(rom): 扩展 getStateQuery 值类型序列化，支持 int/bool/float"
```

---

### Task 2: ROM 端 — getStateQuery 第三步序列化支持 int

**Files:**
- Modify: `app/watering/rom-v2/NetworkExt.cpp:431-437`

- [ ] **Step 1: 将 stateFields 循环中的类型检查从仅支持 string 改为支持 string/int/bool/float**

将：
```cpp
if (kv.value().is<const char *>() == false) {
  continue;
}
const char *valuePtr = kv.value().as<const char *>();
if (valuePtr == nullptr) { continue; }
String pair = urlEncode(keyStr) + "=" + urlEncode(valuePtr);
query += "&" + pair;
```

改为：
```cpp
// 将 JSON 值序列化为字符串，支持 string / int / bool / float 四种类型
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
String pair = urlEncode(keyStr) + "=" + urlEncode(value);
query += "&" + pair;
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/rom-v2/NetworkExt.cpp
git commit -m "fix(rom): 扩展 stateFields 序列化，支持 int/bool/float 类型"
```

---

### Task 3: 服务端 — change 事件 stateId 校验防覆盖

**Files:**
- Modify: `app/watering/api/push-state/route.ts:128-133`

- [ ] **Step 1: 在写入 stepIndex 前添加 stateId 匹配校验**

将：
```typescript
if (stepIndex !== null) {
  const state = await getDeviceState(chipId);
  if (state) {
    state.stepIndex = parseInt(stepIndex, 10);
    await saveDeviceState(state);
  }
}
```

改为：
```typescript
if (stepIndex !== null) {
  const state = await getDeviceState(chipId);
  // 仅当 stateId 匹配时接受 ROM 上报的 stepIndex：
  // 防止用户手动切换步骤后，ROM 延迟到达的旧 change 事件覆盖新值
  if (state && state.stateId === stateId) {
    state.stepIndex = parseInt(stepIndex, 10);
    await saveDeviceState(state);
  }
}
```

- [ ] **Step 2: 运行格式化和类型检查**

```bash
npm run format
npm run check
```

预期：两项均通过，无错误。

- [ ] **Step 3: 提交**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "fix(watering): change 事件 stateId 校验，防止旧事件覆盖步骤索引"
```

---

### 验证清单

- [ ] `npm run format` 通过
- [ ] `npm run check` 通过
- [ ] ROM 固件编译通过（Arduino IDE / PlatformIO）
- [ ] 手动测试：ROM 运行流程，观察前端 StepProgress 是否跟随 ROM 步骤变化
- [ ] 手动测试：用户点击"上一步/下一步"后，前端是否显示正确步骤且不被覆盖
