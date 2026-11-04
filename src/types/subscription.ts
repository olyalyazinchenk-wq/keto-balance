/**
 * src/types/subscription.ts
 * Type definitions for Keto-balance Mini App subscription & monetization flow.
 */

export interface SubscriptionProduct {
  id: string;
  title: string;
  price_rub: number;
  period: 'month' | 'one_time' | string;
  description?: string;
  badge?: string;
}

export interface SubscriptionState {
  is_premium: boolean;
  tier: string | null;
  status: 'none' | 'active' | 'expired' | 'canceled' | string;
  expires_at: string | null;
  available_products: SubscriptionProduct[];
  user_id?: number | null;
}

export interface PurchaseInitPayload {
  product_id: string;
  provider?: string;
}

export interface PurchaseInitResponse {
  order_id: string;
  status: string;
  payment_url: string | null;
  demo_mode: boolean;
}

export interface PurchaseConfirmPayload {
  order_id: string;
}

export interface PurchaseConfirmResponse {
  success: boolean;
  subscription: SubscriptionState;
  is_premium?: boolean;
  tier?: string | null;
  status?: string | null;
  expires_at?: string | null;
}
