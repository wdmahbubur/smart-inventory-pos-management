import { AppError, validateConfig, uuid } from './core.js';
/** Supabase Auth/PostgREST transport. Inventory writes use transactional RPCs. */
export class SupabaseClient {
  constructor(config, { fetcher = globalThis.fetch, storage = globalThis.sessionStorage, lock = globalThis.navigator?.locks } = {}) {
    const c = validateConfig(config.supabaseUrl, config.supabaseKey);
    this.url = c.supabaseUrl; this.key = c.supabaseKey; this.fetcher = fetcher; this.storage = storage; this.lock = lock;
    this.storageKey = `si-session:${this.url}`; this.refreshing = null;
  }
  get session() { try { return JSON.parse(this.storage.getItem(this.storageKey) || 'null'); } catch { return null; } }
  saveSession(session) {
    if (!session?.access_token) { this.storage.removeItem(this.storageKey); return; }
    this.storage.setItem(this.storageKey, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at || Math.floor(Date.now()/1000) + Number(session.expires_in || 3600), user: session.user }));
  }
  async raw(path, { method = 'GET', body, token, headers = {} } = {}) {
    let response;
    try { response = await this.fetcher(`${this.url}${path}`, { method, headers: { apikey: this.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), cache: 'no-store' }); }
    catch (error) { throw new AppError(error.name === 'TimeoutError' ? 'Request timed out. Refresh records before retrying; the transaction may have committed.' : 'Cannot reach Supabase. Check your connection. Do not repeat a sale with a new request ID.', 'NETWORK', 503); }
    let text;try{text=await response.text();}catch{throw new AppError('Response interrupted. Resolve the original request before retrying.', 'NETWORK', 503);}let data;try{data=text?JSON.parse(text):null;}catch{throw new AppError('Invalid server response. Resolve the original request before retrying.', 'NETWORK', 502);}
    if (!response.ok) throw new AppError(data?.message || data?.msg || data?.error_description || data?.error || `Request failed (${response.status}).`, data?.code || 'API_ERROR', response.status);
    return { data, count: Number(response.headers.get('content-range')?.split('/')[1]) || 0 };
  }
  async token() {
    if (!this.session) throw new AppError('Sign in to continue.', 'AUTH_REQUIRED', 401);
    if (this.session.expires_at > Date.now()/1000 + 60) return this.session.access_token;
    if (!this.refreshing) {
      const refresh = async () => {
        const current = this.session;
        if (current?.expires_at > Date.now()/1000 + 60) return current.access_token;
        if (!current?.refresh_token) throw new AppError('Your session expired. Sign in again.', 'AUTH_REQUIRED', 401);
        try { const { data } = await this.raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: current.refresh_token } }); this.saveSession(data); return data.access_token; }
        catch (error) { if ([400,401,403].includes(error.status)) this.saveSession(null); throw error; }
      };
      this.refreshing = (this.lock ? this.lock.request(`si-refresh:${this.url}`, refresh) : refresh()).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
  async login(email, password) { const { data } = await this.raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } }); this.saveSession(data); return data.user; }
  async signup(email, password, origin) { const { data } = await this.raw(`/auth/v1/signup?redirect_to=${encodeURIComponent(origin)}`, { method: 'POST', body: { email: email.trim(), password } }); if (data.access_token) this.saveSession(data); return data; }
  async recover(email, origin) { return this.raw(`/auth/v1/recover?redirect_to=${encodeURIComponent(origin + '?flow=recovery')}`, { method: 'POST', body: { email: email.trim() } }); }
  async updatePassword(password) { return this.raw('/auth/v1/user', { method: 'PUT', body: { password }, token: await this.token() }); }
  async user() { const { data } = await this.raw('/auth/v1/user', { token: await this.token() }); return data; }
  async logout() { try { if (this.session) await this.raw('/auth/v1/logout?scope=local', { method: 'POST', token: await this.token() }); } finally { this.saveSession(null); } }
  async callback(fragment) {
    const params = new URLSearchParams(fragment.replace(/^#/,''));
    if (params.has('error_description')) throw new AppError(params.get('error_description'));
    if (!params.has('access_token')) return false;
    this.saveSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), expires_in: Number(params.get('expires_in')) });
    try { const user = await this.user(); this.saveSession({ ...this.session, user }); return true; } catch (e) { this.saveSession(null); throw e; }
  }
  async select(table, params = {}) {
    if (!/^si_[a-z_]+$/.test(table)) throw new AppError('Invalid table.');
    const query = new URLSearchParams({ select: '*', ...params });
    return this.raw(`/rest/v1/${table}?${query}`, { token: await this.token(), headers: { Prefer: 'count=exact' } });
  }
  async rpc(name, body) {
    if (!/^si_[a-z_]+$/.test(name)) throw new AppError('Invalid operation.');
    return (await this.raw(`/rest/v1/rpc/${name}`, { method: 'POST', token: await this.token(), body })).data;
  }
  async mutate(org, action, payload, key = uuid()) { return this.rpc('si_mutate', { p_org: org, p_action: action, p_payload: payload, p_key: key }); }
}
