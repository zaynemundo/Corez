// Add-on packs: buying extra research reports, images or videos on top of a
// plan. The catalogue, prices and balances all come from the server, so the
// client never invents a price or a credit count.

/**
 * @returns {Promise<{
 *   available: boolean,
 *   error: string|null,
 *   skus: Array<object>,
 *   balances: Record<string, {remaining: number, purchased: number}>,
 *   purchases: Array<object>,
 *   settledNow: Array<object>,
 *   paymentsConfigured: boolean,
 * }>}
 */
export async function fetchAddons() {
  const empty = {
    available: false,
    error: null,
    skus: [],
    balances: {},
    purchases: [],
    settledNow: [],
    paymentsConfigured: false,
  };
  try {
    const response = await fetch('/api/addons', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return {
        ...empty,
        error:
          response.status === 401
            ? 'Sign in again to see add-ons.'
            : `Could not load add-ons (${response.status}).`,
      };
    }
    return {
      available: data.enabled !== false,
      error: null,
      skus: Array.isArray(data.skus) ? data.skus : [],
      balances: data.balances && typeof data.balances === 'object' ? data.balances : {},
      purchases: Array.isArray(data.purchases) ? data.purchases : [],
      settledNow: Array.isArray(data.settledNow) ? data.settledNow : [],
      paymentsConfigured: data.paymentsConfigured !== false,
    };
  } catch (error) {
    return {
      ...empty,
      error: error?.message ? `Could not load add-ons: ${error.message}` : 'Could not load add-ons.',
    };
  }
}

/**
 * Start a purchase. Returns the provider's checkout URL to send the browser to;
 * the credits are only granted once the payment is reconciled server-side.
 */
export async function buyAddon(skuId) {
  try {
    const response = await fetch('/api/addons/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sku: skuId }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `Could not start the purchase (${response.status}).`,
        code: data?.code || null,
      };
    }
    return {
      success: true,
      purchaseId: data?.purchaseId || null,
      redirectUrl: data?.redirect_url || null,
      sku: data?.sku || null,
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message
        ? `Could not start the purchase: ${error.message}`
        : 'Could not start the purchase.',
    };
  }
}

/** Settle a purchase after returning from the payment page. */
export async function verifyAddon(purchaseId) {
  try {
    const response = await fetch('/api/addons/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ purchaseId }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { success: false, error: data?.error || `Verification failed (${response.status}).` };
    }
    return {
      success: true,
      granted: data?.granted === true,
      alreadySettled: data?.alreadySettled === true,
      message: data?.message || (data?.granted ? 'Credits added.' : 'Payment is not completed yet.'),
      balance: data?.balance || null,
      purchase: data?.purchase || null,
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message ? `Verification failed: ${error.message}` : 'Verification failed.',
    };
  }
}

export function formatAed(sku) {
  if (!sku) return '';
  return `${sku.aed} AED`;
}

/** "12 left" / "none left" / "not bought yet" for a catalogue entry. */
export function balanceLabel(balance) {
  const remaining = Number(balance?.remaining || 0);
  if (remaining <= 0) return 'None left';
  return `${remaining} left`;
}
