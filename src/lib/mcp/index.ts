import { defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search-products";
import listCategories from "./tools/list-categories";
import listStores from "./tools/list-stores";

export default defineMcp({
  name: "garimou-achou",
  title: "Garimou Achou",
  version: "0.1.0",
  instructions: "Ferramentas públicas do Garimou Achou! para buscar achados publicados, categorias e lojas. Preços não são retornados; consulte a página do produto.",
  tools: [searchProducts, listCategories, listStores],
});
