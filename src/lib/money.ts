import type { StockStatus } from './domain';
export const MAX_DOCUMENT_PAISA = 1_000_000_000_000n;
export const MAX_UNIT_PAISA = 1_000_000_000n;
export function normalizeDigits(value: string): string { return value.replace(/[০-৯]/g, c => String(c.charCodeAt(0) - 0x09e6)); }
export function parseMoney(value: string, max = MAX_DOCUMENT_PAISA): string {
 const text = normalizeDigits(value.trim());
 if (!/^\d+(?:\.\d{1,2})?$/.test(text) || text.length > 30) throw new Error('Enter a nonnegative amount with at most two decimal places.');
 const [whole, fraction = ''] = text.split('.');
 const paisa = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
 if (paisa > max) throw new Error('Amount exceeds the supported limit.');
 return paisa.toString();
}
export function decimalMoney(paisa: string | bigint): string {
 const n = BigInt(paisa); const absolute = n < 0n ? -n : n;
 return `${n < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
export function money(paisa: string | bigint = '0'): string {
 const n = BigInt(paisa); const absolute = n < 0n ? -n : n;
 const fraction = absolute % 100n;
 return `${n < 0n ? '−' : ''}৳${new Intl.NumberFormat('en-BD').format(absolute / 100n)}${fraction ? '.' + fraction.toString().padStart(2, '0') : ''}`;
}
export function stockStatus(quantity: number, minimum: number): StockStatus { return quantity === 0 ? 'out_of_stock' : quantity < minimum ? 'low_stock' : 'in_stock'; }
export function shortage(quantity: number, minimum: number): number { return Math.max(minimum - quantity, 0); }
export function saleTotals(items: { quantity: number; price_paisa: string }[], discount: string, tender: string) {
 if (!items.length || items.length > 100) throw new Error('Add between one and 100 distinct products.');
 let subtotal = 0n;
 for (const item of items) {
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1_000_000 || !/^\d+$/.test(item.price_paisa)) throw new Error('Enter valid whole-unit quantities.');
  const price = BigInt(item.price_paisa);
  if (price < 1n || price > MAX_UNIT_PAISA) throw new Error('Invalid selling price.');
  subtotal += BigInt(item.quantity) * price;
 }
 const d = BigInt(discount), t = BigInt(tender);
 if (subtotal > MAX_DOCUMENT_PAISA || t > MAX_DOCUMENT_PAISA) throw new Error('Document limit exceeded.');
 if (d < 0n || d >= subtotal) throw new Error('Discount must be less than the subtotal.');
 const total = subtotal - d;
 if (t < total) throw new Error('Cash received must cover the sale total.');
 return { subtotal_paisa: subtotal.toString(), discount_paisa: d.toString(), total_paisa: total.toString(), change_paisa: (t - total).toString() };
}
