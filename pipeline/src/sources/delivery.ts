// Delivery platforms (Wolt, Lieferando, ...) are never a menu source: not fetched, and never exported from a saved menu.
const DELIVERY_PLATFORMS = /(wolt\.com|lieferando\.|lieferbuddy\.|ubereats\.com|deliveroo\.|foodpanda\.|uber\.com|just-eat|takeaway\.com|gorillas|flink)/i;

export function isDeliveryPlatform(urlOrHost: string): boolean {
  return DELIVERY_PLATFORMS.test(urlOrHost);
}

/** Delivery templates can be served from a restaurant-branded domain. A link to delivery alone is normal. */
export function isHostedDeliveryPage(html: string): boolean {
  return /\/tpl\/template\d+\/(?:default|additives)\.(?:js|css)/i.test(html) && /lieferando|takeaway\.com/i.test(html);
}
