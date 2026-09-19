export const BUSINESS_TIMEZONE = 'Asia/Dhaka';
export function businessDate(value: Date | string = new Date()): string { return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
export function displayDate(value: string, withTime = false): string {
 const date = new Date(value.length === 10 ? value + 'T12:00:00+06:00' : value);
 if (!Number.isFinite(date.getTime())) return 'Not available';
 return new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } as const : {}) }).format(date);
}
export function validCalendarDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value; }
export function dateSpan(first: string, last: string): number { return (Date.parse(last + 'T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / 86_400_000 + 1; }
export function safeNext(raw: string | null | undefined, fallback = '/dashboard'): string {
 if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020]/.test(raw)) return fallback;
 try {
  const decoded = decodeURIComponent(raw);
  if (decoded.startsWith('//') || /[\\\u0000-\u0020]/.test(decoded)) return fallback;
  const url = new URL(raw, 'https://inventory.invalid');
  if (url.origin !== 'https://inventory.invalid' || !/^\/(dashboard|products|categories|suppliers|purchases|pos|sales|inventory|reports|insights|reset-password)(\/|$)/.test(url.pathname)) return fallback;
  return url.pathname + url.search;
 } catch { return fallback; }
}
