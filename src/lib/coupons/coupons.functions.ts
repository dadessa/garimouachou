import { createServerFn } from "@tanstack/react-start";

export const publicCouponsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getApprovedCoupons } = await import("./published.server");
  return getApprovedCoupons();
});
