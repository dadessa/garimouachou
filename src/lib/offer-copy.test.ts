import { describe, expect, it } from "vitest";
import { withoutOfferPrice } from "./offer-copy";

describe("texto público do achadinho", () => {
  it("remove preços antigos e marcadores incompletos no fim do título", () => {
    expect(withoutOfferPrice("Bicicleta Acte BSP13 – R$ 1.590,90")).toBe("Bicicleta Acte BSP13");
    expect(withoutOfferPrice("Fone Bluetooth - R$")).toBe("Fone Bluetooth");
  });

  it("retira valores em reais do meio do texto", () => {
    expect(withoutOfferPrice("Confira R$ 499,90 na oferta")).toBe(
      "Confira o preço na loja na oferta",
    );
  });

  it("preserva números que identificam o modelo ou especificação", () => {
    expect(withoutOfferPrice("Bicicleta BSP13 — roda de 13 kg")).toBe(
      "Bicicleta BSP13 — roda de 13 kg",
    );
  });
});
