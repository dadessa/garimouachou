import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search-products";
import listCategories from "./tools/list-categories";
import listStores from "./tools/list-stores";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  name: "garimou-achou",
  title: "Garimou Achou",
  version: "0.1.0",
  instructions: "Ferramentas do Garimou Achou! para buscar achados publicados, categorias e lojas. Preços não são retornados; consulte a página do produto.",
  tools: [searchProducts, listCategories, listStores],
});
