export async function register() {
  console.log('[INSTRUMENTATION] register() called');
  console.log('[INSTRUMENTATION] NEXT_RUNTIME:', process.env.NEXT_RUNTIME);
  // 仅在 Node.js 环境执行（非 Edge）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[INSTRUMENTATION] Node.js runtime detected, importing initDb...');
    try {
      const { initDb } = await import('./app/watering/services/db');
      console.log('[INSTRUMENTATION] initDb imported, calling...');
      await initDb();
      console.log('[INSTRUMENTATION] initDb completed successfully');
    } catch (e) {
      console.error('[INSTRUMENTATION] initDb failed:', e);
      throw e;
    }
  } else {
    console.log('[INSTRUMENTATION] Not Node.js runtime, skipping db init');
  }
}
