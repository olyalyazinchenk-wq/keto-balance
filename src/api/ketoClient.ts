import { fetchWithTimeout } from './fetchWithTimeout';
import type {
  PilotCatalogV1,
  PilotSaveResultV1,
  PilotShoppingReadV1,
  PilotShoppingWriteV1,
  PilotUserReadV1,
  PilotUserWriteV1,
} from './pilotTypes';

export interface SessionInfo {
  session_token: string;
  user_id: number;
  username?: string;
  first_name?: string;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource revision conflict (409)') {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized (401)') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export interface KetoClientOptions {
  baseUrl?: string;
  onUnauthorized?: () => void;
}

export class KetoClient {
  private token: string | null = null;
  private baseUrl: string;
  public onUnauthorized?: () => void;

  constructor(options: KetoClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
    this.onUnauthorized = options.onUnauthorized;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}, isPublic = false): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers || {});
    const requestToken = this.token;

    if (!isPublic) {
      if (!requestToken) {
        throw new UnauthorizedError('No authentication token available');
      }
      headers.set('Authorization', `Bearer ${requestToken}`);
    } else if (requestToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${requestToken}`);
    }

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(url, { ...options, headers });
    } catch (err: any) {
      throw new ApiError(0, `Network failure requesting ${path}: ${err?.message || err}`);
    }

    if (response.status === 401) {
      // An anonymous or superseded request must not expire a newer login.
      if (requestToken && this.token === requestToken && headers.get('Authorization') === `Bearer ${requestToken}`) {
        this.token = null;
        this.onUnauthorized?.();
      }
      throw new UnauthorizedError('Session expired or unauthorized (401)');
    }

    if (response.status === 409) {
      let errDetail = 'Revision conflict';
      try {
        const body = await response.json();
        errDetail = body.detail || errDetail;
      } catch {
        // ignore
      }
      throw new ConflictError(errDetail);
    }

    let data: any;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err: any) {
        throw new ApiError(response.status, `Malformed JSON response from ${path}: ${err.message}`);
      }
    }

    if (!response.ok) {
      const msg = data?.detail || `HTTP Error ${response.status} from ${path}`;
      throw new ApiError(response.status, msg, data);
    }

    return data as T;
  }

  async createSession(initData: string): Promise<SessionInfo> {
    const data = await this.request<SessionInfo>(
      '/api/session',
      {
        method: 'POST',
        body: JSON.stringify({ init_data: initData }),
      },
      true
    );
    this.setToken(data.session_token);
    return data;
  }

  async createDemoSession(demoUser: number = 1084557944): Promise<SessionInfo> {
    const data = await this.request<SessionInfo>(
      `/api/demo-session?demo_user=${demoUser}`,
      { method: 'GET' },
      true
    );
    this.setToken(data.session_token);
    return data;
  }

  async getCatalog(catalogId?: string): Promise<PilotCatalogV1> {
    const query = catalogId ? `?catalog_id=${encodeURIComponent(catalogId)}` : '';
    return this.request<PilotCatalogV1>(`/api/catalog${query}`, { method: 'GET' }, true);
  }

  async listCatalogs(): Promise<{
    catalogs: Array<{
      catalog_id: string;
      catalog_month?: string;
      editorial_status: string;
      accessible: boolean;
      total_recipes: number;
    }>;
  }> {
    return this.request('/api/catalogs', { method: 'GET' }, true);
  }

  async getUser(): Promise<PilotUserReadV1> {
    return this.request<PilotUserReadV1>('/api/user', { method: 'GET' });
  }

  async putUser(data: PilotUserWriteV1): Promise<PilotSaveResultV1> {
    return this.request<PilotSaveResultV1>('/api/user', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getShopping(): Promise<PilotShoppingReadV1> {
    return this.request<PilotShoppingReadV1>('/api/shopping', { method: 'GET' });
  }

  async putShopping(data: PilotShoppingWriteV1): Promise<PilotSaveResultV1> {
    return this.request<PilotSaveResultV1>('/api/shopping', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
}
