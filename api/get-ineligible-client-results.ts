import 'server-only';
import { getAccessToken } from './tokenService';
import { OptimalBlueConfig } from '@/core/settings';

/**
 * Fetch ineligible products for a given search ID
 * Uses the Complete Search Results API (Full API)
 * 
 * Endpoint: GET /full/api/businesschannels/{businessChannelId}/originators/{originatorId}/productsearch/{searchId}/ineligible
 * 
 * @param searchId - The search ID from the initial product search response
 * @returns Raw Response object from the Optimal Blue API
 */
export async function getIneligibleProducts(searchId: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    // Get configuration from environment (dev) or Google Secret Manager (production)
    const config = OptimalBlueConfig.getInstance();
    const baseUrl = await config.getValue('OB_API_BASE_URL');
    const businessChannelId = await config.getValue('OB_BUSINESS_CHANNEL_ID');
    const originatorId = await config.getValue('OB_ORIGINATOR_ID');
    
    // Construct URL for the Full API ineligible products endpoint
    // Note: Uses /full/api/ path (Complete Search Results API), not /consumer/api/ (Best Execution API)
    const url = `${baseUrl.replace(/\/$/, '')}/full/api/businesschannels/${encodeURIComponent(businessChannelId)}/originators/${encodeURIComponent(originatorId)}/productsearch/${encodeURIComponent(searchId)}/ineligible`;

    const token = await getAccessToken(controller.signal);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-version': '4',
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}
