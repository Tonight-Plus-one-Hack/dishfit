// Keep issued offer IDs when adding a new offer. Signups retain the offer they received.
export const WAITLIST_OFFERS = {
  premium_month: { de: "1 Monat DishFit Premium gratis", en: "1 free month of DishFit Premium" },
} as const;

export type WaitlistOffer = keyof typeof WAITLIST_OFFERS;
export const WAITLIST_OFFER: WaitlistOffer = "premium_month";
export type WaitlistCoupon = { code: string; offer: WaitlistOffer };
