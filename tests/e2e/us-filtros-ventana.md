# Guion E2E — Filtros «Sin responder» y «Por vencer» (052)

> Automatizado en `scripts/e2e-filtros-ventana.mjs` (16 checks en una base sin
> conversaciones por vencer; 15 si ya las hay). Spec:
> [052](../../specs/052-filtros-ventana/spec.md).

## Por qué

Pasada la ventana del canal solo se le puede escribir al cliente con una
plantilla de pago. La bandeja no decía quién esperaba respuesta ni a quién se
le estaba por cerrar la ventana.

## Camino verificado

1. **AC4.** Sin conversaciones por vencer no se pinta «Por vencer».
2. Entran cuatro conversaciones:
   - una de ahora;
   - otra de ahora, a la que se le dejará una nota;
   - una de hace 22 h 30 min;
   - una de hace 30 h.

   El DTO trae `esperandoRespuesta`.
3. **AC1.** La de ahora está en «Sin responder» y sale al contestarle.
4. **AC2.** Con una nota interna (050), la otra sigue en «Sin responder».
5. **AC3.**
   - Aparece «Por vencer», con la de hace 22 h 30 min y sin la de recién ni la
     cerrada.
   - Su fila dice «Vence en 1 h 2x min».
6. **AC5.**
   - Combinado con la búsqueda de la cerrada, queda vacío.
   - En «Todas», el chip se sigue viendo.
7. **AC6.** A 390 px, con la lista pintada, la fila de filtros envuelve sin
   desplazamiento horizontal.
