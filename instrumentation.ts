export async function register() {
  // 仅在 Node.js 环境执行（非 Edge）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDb } = await import("./app/watering/services/db");
    await initDb();
  }
}
