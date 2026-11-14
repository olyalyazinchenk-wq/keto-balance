/**
 * src/adapters/pilotApi.ts
 * Frontend subscription & monetization API client for Keto-balance Mini App.
 */

import { fetchWithTimeout } from '../api/fetchWithTimeout';
import type {
  SubscriptionState,
  PurchaseInitResponse,
  PurchaseConfirmResponse,
} from '../types/subscription';

export class PilotApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'PilotApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Fetches the current subscription state for the authenticated user.
 * Endpoint: GET /api/subscription
 */
export async function fetchSubscription(
  token: string,
  baseUrl: string = ''
): Promise<SubscriptionState> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/subscription`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'GET',
      headers,
    });
  } catch (err: any) {
    throw new PilotApiError(0, `Network error fetching subscription: ${err?.message || err}`);
  }

  let data: any = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err: any) {
      throw new PilotApiError(
        response.status,
        `Malformed JSON response from /api/subscription: ${err?.message || err}`
      );
    }
  }

  if (!response.ok) {
    const errorMsg = data?.detail || `Subscription fetch failed (HTTP ${response.status})`;
    throw new PilotApiError(response.status, errorMsg, data);
  }

  return data as SubscriptionState;
}

/**
 * Initializes a new subscription purchase order.
 * Endpoint: POST /api/subscription/purchase
 */
export async function purchaseSubscription(
  token: string,
  productId: string,
  provider: string = 'demo',
  baseUrl: string = ''
): Promise<PurchaseInitResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/subscription/purchase`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ product_id: productId, provider }),
    });
  } catch (err: any) {
    throw new PilotApiError(0, `Network error initiating purchase: ${err?.message || err}`);
  }

  let data: any = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err: any) {
      throw new PilotApiError(
        response.status,
        `Malformed JSON response from /api/subscription/purchase: ${err?.message || err}`
      );
    }
  }

  if (!response.ok) {
    const errorMsg = data?.detail || `Purchase initialization failed (HTTP ${response.status})`;
    throw new PilotApiError(response.status, errorMsg, data);
  }

  return data as PurchaseInitResponse;
}

/**
 * Confirms a demo payment order to immediately grant active subscription entitlement.
 * Endpoint: POST /api/subscription/confirm-demo
 */
export async function confirmDemoPayment(
  token: string,
  orderId: string,
  baseUrl: string = ''
): Promise<PurchaseConfirmResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/subscription/confirm-demo`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (err: any) {
    throw new PilotApiError(0, `Network error confirming demo payment: ${err?.message || err}`);
  }

  let data: any = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err: any) {
      throw new PilotApiError(
        response.status,
        `Malformed JSON response from /api/subscription/confirm-demo: ${err?.message || err}`
      );
    }
  }

  if (!response.ok) {
    const errorMsg = data?.detail || `Demo payment confirmation failed (HTTP ${response.status})`;
    throw new PilotApiError(response.status, errorMsg, data);
  }

  return data as PurchaseConfirmResponse;
}
