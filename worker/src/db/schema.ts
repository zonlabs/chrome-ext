export interface Env extends __BaseEnv_Env {}

export async function insertPriceHistory(
  db: D1Database,
  productKey: string,
  store: string,
  url: string,
  price: number,
  currency: string
): Promise<void> {
  await db.prepare(
    `INSERT INTO price_history (product_key, store, url, price, currency) VALUES (?, ?, ?, ?, ?)`
  ).bind(productKey, store, url, price, currency).run();
}

export async function getPriceHistory(
  db: D1Database,
  productKey: string,
  days: number = 90
): Promise<Array<{ price: number; timestamp: string; store: string }>> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const result = await db.prepare(
    `SELECT price, timestamp, store FROM price_history WHERE product_key = ? AND timestamp >= ? ORDER BY timestamp ASC`
  ).bind(productKey, cutoff).all();
  return result.results as any;
}

export function generateProductKey(name: string, store: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}::${store.toLowerCase()}`;
}


