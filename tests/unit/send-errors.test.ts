import { describe, expect, it } from "vitest";
import { describeSendError } from "@/lib/meta/send-errors";

describe("describeSendError (fallo real del 2026-08-05)", () => {
  it("130472 → explica el experimento de Meta y qué hacer", () => {
    const msg = describeSendError(130472, "User's number is part of an experiment");
    expect(msg).toMatch(/experimento/i);
    expect(msg).toMatch(/UTILITY/);
    expect(msg).toMatch(/130472/);
    // Nada de jerga cruda de Meta en la frase principal.
    expect(msg).not.toMatch(/User's number/);
  });

  it("códigos conocidos de plantillas y ventana", () => {
    expect(describeSendError(131047)).toMatch(/24 h/);
    expect(describeSendError(132001)).toMatch(/template/i);
    expect(describeSendError(132015)).toMatch(/pausado/i);
    expect(describeSendError(131026)).toMatch(/não pode receber/i);
  });

  it("código desconocido → conserva el texto crudo de Meta y el número", () => {
    expect(describeSendError(999999, "Something odd happened")).toBe(
      "Something odd happened (Meta 999999)"
    );
  });

  it("sin código ni texto → mensaje honesto, nunca vacío", () => {
    expect(describeSendError(null)).toBe("A Meta rejeitou o envio");
    expect(describeSendError(undefined, "   ")).toBe("A Meta rejeitou o envio");
  });

  it("sin código pero con texto → usa el texto tal cual", () => {
    expect(describeSendError(null, "Fallo de red")).toBe("Fallo de red");
  });
});
