import { z } from 'zod';
import { businessDate, dateSpan, validCalendarDate } from './dates';
const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1, 'This field is required.');
const optionalText = (max: number) => text(max).optional();
const version = z.number().int().min(1).max(2_147_483_647);
const paisa = (max: bigint, positive = false) => z.string().regex(/^\d{1,13}$/, 'Invalid integer money.').refine(v => BigInt(v) <= max && (!positive || BigInt(v) > 0n), 'Amount is outside the supported range.');
const unitMoney = paisa(1_000_000_000n);
const documentMoney = paisa(1_000_000_000_000n);
const identity = { id: id.optional(), expected_version: version.optional() };
const appearance = { icon_key: z.enum(['package','bottle','bag','bread','milk','store']).optional(), color_key: z.enum(['emerald','amber','blue','rose','violet','sand']).optional() };
const versioned = <T extends { id?: string; expected_version?: number }>(value: T) => !value.id || !!value.expected_version;
export const productSchema = z.object({ ...identity, name: required(150), sku: required(64).regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, hyphens, underscores or dots.'), category_id: id, unit: z.enum(['piece','bottle','pack','carton','bag']), minimum_stock: z.number().int().min(0).max(1_000_000_000), reference_cost_paisa: unitMoney, selling_price_paisa: paisa(1_000_000_000n, true), description: optionalText(1000), ...appearance }).strict().refine(versioned, 'Reload this record before editing.');
export const categorySchema = z.object({ ...identity, name: required(80), description: optionalText(1000), ...appearance }).strict().refine(versioned, 'Reload this record before editing.');
export const supplierSchema = z.object({ ...identity, name: required(150), phone: optionalText(32), address: optionalText(500) }).strict().refine(versioned, 'Reload this record before editing.');
export const storeSchema = z.object({ name: text(100).min(2), display_name: text(100).min(2), phone: optionalText(32), address: optionalText(500) }).strict();
export const identitySchema = z.object({ id, expected_version: version }).strict();
const quantity = z.number().int('Use whole units.').min(1).max(1_000_000);
const purchaseLine = z.object({ product_id: id, quantity, unit_cost_paisa: unitMoney }).strict();
const saleLine = z.object({ product_id: id, quantity, expected_price_paisa: paisa(1_000_000_000n, true), expected_version: version }).strict();
const distinct = (items: { product_id: string }[]) => new Set(items.map(x => x.product_id)).size === items.length;
export const purchaseSchema = z.object({ ...identity, supplier_id: id, purchase_date: z.string().refine(validCalendarDate, 'Choose a valid invoice date.').refine(v => v <= businessDate(), 'Invoice date cannot be in the future.'), supplier_reference: optionalText(150), note: optionalText(1000), items: z.array(purchaseLine).min(1).max(100).refine(distinct, 'Combine duplicate product rows.') }).strict().refine(versioned, 'Reload this draft before editing.').refine(v => v.items.reduce((n, i) => n + BigInt(i.quantity) * BigInt(i.unit_cost_paisa), 0n) <= 1_000_000_000_000n, 'Purchase total exceeds the limit.');
export const saleSchema = z.object({ items: z.array(saleLine).min(1).max(100).refine(distinct, 'Combine duplicate product rows.'), discount_paisa: documentMoney, cash_received_paisa: documentMoney, customer_name: optionalText(150), customer_phone: optionalText(32) }).strict();
export const mutationSchema = z.object({ operation: z.enum(['catalog','save_purchase_draft','receive_purchase','delete_purchase_draft','complete_sale']), request_id: id, kind: z.enum(['product','category','supplier','store']).optional(), action: z.enum(['save','delete','archive','restore']).optional(), payload: z.record(z.string(), z.unknown()) }).strict();
export type MutationInput = z.infer<typeof mutationSchema>;
export const filtersSchema = z.object({ q: text(150).optional(), page: z.number().int().min(1).max(1_000_000).optional(), size: z.union([z.literal(20),z.literal(50),z.literal(100)]).optional(), sort: z.enum(['name_asc','name_desc','stock_asc','stock_desc','price_asc','price_desc','newest']).optional(), category: id.optional(), stock: z.enum(['in_stock','low_stock','out_of_stock','attention']).optional(), archived: z.boolean().optional(), status: z.enum(['draft','received','completed','purchase','sale']).optional(), from: z.string().refine(validCalendarDate).optional(), to: z.string().refine(validCalendarDate).optional(), supplier: id.optional(), product: id.optional(), document: id.optional() }).strict().refine(v => !v.from && !v.to || !!v.from && !!v.to && dateSpan(v.from,v.to) >= 1 && dateSpan(v.from,v.to) <= 366, 'Choose a date range of at most 366 days.');
export const registerSchema = z.object({ full_name: text(100).min(2), store_name: text(100).min(2), email: z.string().trim().email(), password: z.string().min(8).max(128), confirm_password: z.string() }).refine(v => v.password === v.confirm_password, { path: ['confirm_password'], message: 'Passwords do not match.' });
export const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });
export const resetSchema = z.object({ password: z.string().min(8).max(128), confirm_password: z.string() }).refine(v => v.password === v.confirm_password, { path: ['confirm_password'], message: 'Passwords do not match.' });
export function parseFilters(params: Record<string, string | string[] | undefined>) {
 const f: Record<string, unknown> = {};
 for (const key of ['q','page','size','sort','category','stock','archived','status','from','to','supplier','product','document']) {
  const value = params[key];
  if (typeof value !== 'string' || !value) continue;
  f[key] = ['page','size'].includes(key) ? Number(value) : key === 'archived' ? value === 'true' : value;
 }
 return filtersSchema.parse(f);
}
