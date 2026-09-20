export const errorMessages: Record<string,string> = {
 SETUP_REQUIRED: 'This deployment needs its dedicated Supabase URL and publishable key. No sample data is substituted.',
 UNAUTHENTICATED: 'Your session has expired. Log in again; your unsent work stays in this tab.', NOT_FOUND: 'This record is unavailable or does not belong to your store.',
 VALIDATION_ERROR: 'Check the highlighted fields and try again.', SKU_EXISTS: 'This SKU already exists in your store, including archived products.', CATEGORY_EXISTS: 'A category with this name already exists.',
 REFERENCE_IN_USE: 'This record is referenced. Reassign dependent catalog records or preserve its history by archiving where allowed.', STOCK_NOT_ZERO: 'Products with remaining stock cannot be archived or deleted.', DRAFT_IN_USE: 'A saved purchase draft references this record. Reassign or delete that draft first.',
 IDENTITY_IMMUTABLE: 'SKU and stock unit cannot change after a purchase or sale reference.', VERSION_CONFLICT: 'Another tab changed this record. Reload the latest version before continuing.', POSTED_IMMUTABLE: 'Posted purchases and sales cannot be edited or deleted in this release.',
 INSUFFICIENT_STOCK: 'Available stock changed. Review the affected item and quantity; nothing was posted.', PRICE_CHANGED: 'A catalog price or product version changed. Review current prices before completing the sale.',
 INSUFFICIENT_CASH: 'Cash received must cover the total.', INVALID_DISCOUNT: 'The discount must be nonnegative and less than the subtotal.', STOCK_LIMIT: 'Receiving this quantity would exceed the stock limit.',
 IDEMPOTENCY_CONFLICT: 'This request key belongs to different input. Resolve the original operation before changing it.', DATE_RANGE_LIMIT: 'Choose a date range of at most 366 days.', EXPORT_ROW_LIMIT: 'This export exceeds 100,000 source rows. Narrow the date range or filters.',
 OPENROUTER_NOT_CONFIGURED: 'OpenRouter is selected, but OPENROUTER_API_KEY is missing from this production deployment. Add it as a server-side Vercel secret and redeploy.', AI_NOT_CONFIGURED: 'AI provider configuration is incomplete. Inventory, sales, purchases and source facts remain available.', AI_PROVIDER_UNSUPPORTED: 'The configured AI provider has no installed adapter.', AI_RATE_LIMITED: 'The store generation limit was reached. Try again in the next hourly window.', AI_IN_PROGRESS: 'An insight is already being generated for this language. Try again shortly.', AI_TIMEOUT: 'The AI provider timed out. Your inventory was not changed.', AI_INVALID_OUTPUT: 'The AI response could not be grounded in the supplied facts. It was not saved.', AI_UNAVAILABLE: 'The AI provider is unavailable. Source facts below are still usable.',
 TEMPORARY_FAILURE: 'The outcome is not yet known. Keep this page open and retry the same request; do not create another transaction.'
};
export class AppError extends Error { constructor(public code:string, public details?: Record<string,unknown>, public uncertain=false) { super(errorMessages[code] ?? errorMessages.TEMPORARY_FAILURE); this.name='AppError'; } }
export function fromDatabase(error: {message:string;code?:string;details?:string}): AppError {
 const code = error.message;
 if (errorMessages[code]) {
  let details: Record<string,unknown> | undefined;
  if (['PRICE_CHANGED','INSUFFICIENT_STOCK'].includes(code) && error.details) { try { details=JSON.parse(error.details); } catch { /* No untrusted diagnostic text reaches the UI. */ } }
  return new AppError(code,details);
 }
 if (['22P02','22003','22007','22008','23514','23502'].includes(error.code ?? '')) return new AppError('VALIDATION_ERROR');
 return new AppError('TEMPORARY_FAILURE',undefined,true);
}
