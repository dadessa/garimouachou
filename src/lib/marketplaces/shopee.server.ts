/** Shopee Affiliate Open API (GraphQL, assinatura SHA256 de AppId+Timestamp+Payload+Secret). */
const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

export function shopeeConfigured() {
  return !!process.env["SHOPEE_AFFILIATE_APP_ID"] && !!process.env["SHOPEE_AFFILIATE_APP_SECRET"];
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function shopeeQuery<T>(query: string, variables: Record<string, unknown> = {}) {
  const appId = process.env["SHOPEE_AFFILIATE_APP_ID"];
  const secret = process.env["SHOPEE_AFFILIATE_APP_SECRET"];
  if (!appId || !secret) throw new Error("Shopee não configurada.");
  const payload = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await sha256Hex(`${appId}${ts}${payload}${secret}`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sig}`,
    },
    body: payload,
  });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message?: string }[];
  } | null;
  if (!res.ok || !body || body.errors?.length) {
    throw new Error(`Shopee [${res.status}]: ${body?.errors?.[0]?.message ?? "resposta inválida"}`);
  }
  return body.data as T;
}

export interface ShopeeOffer {
  itemId: number;
  shopId: number;
  productName: string;
  imageUrl: string | null;
  price: string | null;
  priceMin: string | null;
  priceMax: string | null;
  priceDiscountRate: number | null;
  commissionRate: string | null;
  sales: number | null;
  offerLink: string;
  productLink: string;
  ratingStar?: string | null;
  sellerCommissionRate?: string | null;
  shopeeCommissionRate?: string | null;
  periodEndTime?: number | null;
}

/** Ordenações oficiais do productOfferV2. */
export const SHOPEE_SORT = {
  relevancia: 1,
  maisVendidos: 2,
  maiorPreco: 3,
  menorPreco: 4,
  maiorComissao: 5,
} as const;

export async function shopeeRadarPage(opts: {
  keyword?: string;
  productCatId?: number;
  page: number;
  sortType: number;
  limit?: number;
}) {
  const q = `query($keyword:String,$productCatId:Int,$page:Int,$limit:Int,$sortType:Int){productOfferV2(keyword:$keyword,productCatId:$productCatId,page:$page,limit:$limit,sortType:$sortType){nodes{itemId shopId productName imageUrl price priceMin priceMax priceDiscountRate commissionRate sellerCommissionRate shopeeCommissionRate ratingStar sales offerLink productLink periodEndTime} pageInfo{page hasNextPage}}}`;
  const d = await shopeeQuery<{
    productOfferV2: { nodes: ShopeeOffer[]; pageInfo: { page: number; hasNextPage: boolean } };
  }>(q, {
    keyword: opts.keyword ?? "",
    productCatId: opts.productCatId,
    page: opts.page,
    limit: opts.limit ?? 50,
    sortType: opts.sortType,
  });
  return d.productOfferV2;
}

export async function shopeeSearch(keyword: string, page: number, sortType: number) {
  const q = `query($keyword:String,$page:Int,$sortType:Int){productOfferV2(keyword:$keyword,page:$page,limit:20,sortType:$sortType){nodes{itemId shopId productName imageUrl price priceMin priceMax priceDiscountRate commissionRate sales offerLink productLink} pageInfo{page hasNextPage}}}`;
  const d = await shopeeQuery<{
    productOfferV2: { nodes: ShopeeOffer[]; pageInfo: { page: number; hasNextPage: boolean } };
  }>(q, { keyword, page, sortType });
  return d.productOfferV2;
}
