import { activeCoupons, type Coupon } from "./rules";

// Registro de publicação revisado via Git. Nunca colocar credenciais ou cupons privados aqui.
// Futuramente migrar para tabela própria criada pelo Lovable com RLS.
const approvedCoupons: Coupon[] = [];

export function getApprovedCoupons() {
  const publisher = process.env["AWIN_PUBLISHER_ID"]?.trim();
  return activeCoupons(approvedCoupons).filter(
    (c) => c.source !== "awin" || (!!publisher && c.publisherId === publisher),
  );
}
