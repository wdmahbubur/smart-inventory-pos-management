/** Pure domain functions. Currency values are safe integer minor units, never floats. */
export class AppError extends Error {
  constructor(message, code = 'VALIDATION', status = 400) { super(message); this.name = 'AppError'; this.code = code; this.status = status; }
}
export const MAX_MONEY = 1_000_000_000_000;
export const MAX_QUANTITY = 1_000_000;
export const uuid = () => crypto.randomUUID();
export function assert(condition, message, code) { if (!condition) throw new AppError(message, code); }
export function integer(value, label = 'Value', min = 0, max = MAX_MONEY) {
  assert(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be a whole number between ${min} and ${max}.`);
  return value;
}
export function toMinor(value) {
  const text = String(value).trim();
  assert(/^\d{1,10}(\.\d{1,2})?$/.test(text), 'Enter a non-negative amount with up to two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  return integer(Number(whole) * 100 + Number(fraction.padEnd(2, '0')), 'Amount');
}
export function quantity(value, allowZero = false) {
  const text = String(value).trim();
  assert(/^\d{1,7}$/.test(text), 'Quantity must be a whole number.');
  return integer(Number(text), 'Quantity', allowZero ? 0 : 1, MAX_QUANTITY);
}
export function cleanText(value, label, max = 160, required = true) {
  const text = String(value ?? '').trim();
  assert(!required || text.length > 0, `${label} is required.`);
  assert(text.length <= max, `${label} must be at most ${max} characters.`);
  return text;
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export const money = (value, currency = 'BDT') => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format((Number(value) || 0) / 100);
export const decimal = (value) => (Number(value || 0) / 100).toFixed(2);
export const number = (value) => new Intl.NumberFormat('en').format(Number(value || 0));
export function dateLabel(value, timezone = 'Asia/Dhaka', time = false) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en', { timeZone: timezone, month: 'short', day: 'numeric', year: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(date);
}
export function dateKey(value = new Date(), timezone = 'Asia/Dhaka') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year','month','day'].map(k => parts.find(p => p.type === k).value).join('-');
}
export function totalCart(lines, discount = 0, taxBps = 0) {
  assert(Array.isArray(lines) && lines.length > 0 && lines.length <= 100, 'Add between 1 and 100 products.');
  const ids = new Set(); let subtotal = 0;
  for (const line of lines) {
    assert(line.product_id && !ids.has(line.product_id), 'A product can appear only once.'); ids.add(line.product_id);
    subtotal += integer(line.quantity, 'Quantity', 1, MAX_QUANTITY) * integer(line.unit_price_minor, 'Price');
    integer(subtotal, 'Subtotal');
  }
  integer(discount, 'Discount', 0, subtotal); integer(taxBps, 'Tax rate', 0, 10000);
  const net = subtotal - discount;
  const tax = Number((BigInt(net) * BigInt(taxBps) + 5000n) / 10000n);
  return { subtotal_minor: subtotal, discount_minor: discount, tax_minor: tax, total_minor: integer(net + tax, 'Total') };
}
export function allocateTotals(lines, discount, taxBps) {
  const totals = totalCart(lines, discount, taxBps);
  let grossSoFar = 0, netSoFar = 0, allocatedDiscount = 0, allocatedTax = 0;
  return lines.map(line => {
    const gross = line.quantity * line.unit_price_minor; grossSoFar += gross;
    const d = totals.subtotal_minor ? Number(BigInt(discount) * BigInt(grossSoFar) / BigInt(totals.subtotal_minor)) : 0;
    const lineDiscount = d - allocatedDiscount; allocatedDiscount = d; netSoFar += gross - lineDiscount;
    const net = totals.subtotal_minor - discount;
    const t = net ? Number(BigInt(totals.tax_minor) * BigInt(netSoFar) / BigInt(net)) : 0;
    const lineTax = t - allocatedTax; allocatedTax = t;
    return { ...line, discount_minor: lineDiscount, tax_minor: lineTax, line_total_minor: gross - lineDiscount + lineTax };
  });
}
export function returnValue(lineTotal, sold, alreadyReturned, returning) {
  integer(lineTotal); integer(sold, 'Sold', 1, MAX_QUANTITY); integer(alreadyReturned, 'Already returned', 0, sold); integer(returning, 'Return quantity', 1, sold - alreadyReturned);
  return Number(BigInt(lineTotal) * BigInt(alreadyReturned + returning) / BigInt(sold) - BigInt(lineTotal) * BigInt(alreadyReturned) / BigInt(sold));
}
export const balanceDue = (sale) => Math.max(0, sale.total_minor - sale.returned_minor - sale.paid_minor + sale.refunded_minor);
export function csv(rows, columns) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [columns.map(c => cell(c.label)).join(','), ...rows.map(row => columns.map(c => cell(c.value ? c.value(row) : row[c.key])).join(','))].join('\r\n');
}
export function validateConfig(url, key) {
  let parsed; try { parsed = new URL(url); } catch { throw new AppError('Enter a valid Supabase project URL.'); }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  assert((parsed.protocol === 'https:' || local && parsed.protocol === 'http:') && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname.replace(/\/$/, '') === '', 'Use your HTTPS Supabase project origin, without a path.');
  assert(local || /^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname), 'Use an official Supabase project URL (or localhost for local development).');
  assert(typeof key === 'string' && key.length > 20 && key.length < 3000, 'Enter the project publishable key or legacy anon key.');
  assert(!key.startsWith('sb_secret_'), 'Secret keys must never be entered in a browser. Use a publishable key.');
  if (!key.startsWith('sb_publishable_')) {
    try { const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); assert(payload.role === 'anon', 'Only legacy anon keys are allowed.'); }
    catch { throw new AppError('Use a publishable key or a legacy anon key, never a service-role key.'); }
  }
  return { supabaseUrl: parsed.origin, supabaseKey: key.trim() };
}
export const isManager = role => ['owner','manager'].includes(role);
export function debounce(fn, ms = 250) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; }
export function parseImport(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length > 0 && lines.length <= 100, 'Use 1–100 lines: SKU, quantity, unit cost.');
  return lines.map((line, i) => {
    const parts = line.split(',').map(s => s.trim());
    assert(parts.length === 3 && parts[0].length <= 80, `Line ${i + 1}: expected SKU, quantity, unit cost.`);
    return { sku: cleanText(parts[0], 'SKU', 80), name: parts[0], quantity: quantity(parts[1]), unit_cost_minor: toMinor(parts[2]), confidence: 1, warning: '' };
  });
}
