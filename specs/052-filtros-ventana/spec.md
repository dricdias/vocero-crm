# 052 — Filtros «Sin responder» y «Por vencer»

**Feature Branch**: `feat/052-filtros-ventana` (sobre la 051, #153)

**Created**: 2026-10-23

**Status**: Especificada antes de escribir código. Implementada; gates, arnés E2E (16/16 en base limpia) y self-test general (280/280) en verde.

**Input**: sexta y última spec del recorte de la 2.2, elegida por Kevin el
2026-10-23 ([046 research.md](../046-referencias-2.2/research.md)). Viene de
wacrm (MIT, código leído): su filtro «expiring» (la ventana de 24 h cierra en
menos de 2 h) y «esperando respuesta» (`src/lib/inbox/inbox-filters.ts`). No
se copia código: allá son filtros de servidor sobre Supabase; aquí, del lado
del cliente, como los de la 014 y la 018.

**Carril**: ligero (Principio VI). Sin modelo de datos. El DTO de la bandeja
gana un campo (`esperandoRespuesta`), igual que hizo la 028 con `composer`:
es la API interna, no un contrato publicado.

## Problema

Pasada la ventana del canal (24 h en WhatsApp), al cliente solo se le puede
escribir con una plantilla aprobada, que se paga y puede no llegar. La
bandeja no dice qué conversaciones están por perder la ventana, ni cuáles
esperan respuesta. Con 30 chats abiertos, eso se descubre tarde: «La ventana
de 24 horas está cerrada».

## Decisiones

**D1 — «Sin responder».** Son las conversaciones cuyo último mensaje es del
cliente: alguien escribió y nadie le ha contestado.

- Las notas internas (050) no cuentan: no son mensajes.
- Un saliente del agente o de una persona sí cuenta como respuesta.
- El filtro está siempre, con su contador, junto a «No leídas». No es lo
  mismo: «no leída» es que nadie del equipo la abrió; «sin responder» es que
  el cliente espera.

**D2 — «Por vencer».** Son las conversaciones con la ventana del canal
abierta y **2 horas o menos** por delante (`windowRemainingMs`, que ya sale
de `windowMsFor(channel)`, nunca un «24 h» cableado). Como «Anuncios» (018),
el filtro aparece solo si hay alguna, o si está elegido (para poder salir de
él).

**D3 — La fila avisa.** Una conversación por vencer lleva en la lista un chip
«Vence en 1 h 20 min» en tono de aviso. Se ve aunque no esté puesto el
filtro.

**D4 — El tiempo es el de la última carga.** La lista se vuelve a pedir con
cada evento del SSE, así que la cuenta se mantiene al día mientras hay
movimiento. No se pone un reloj por fila: con decenas de conversaciones serían
decenas de temporizadores para ganar minutos.

## Criterios de aceptación

- **AC1.** Un cliente escribe y nadie contesta: aparece en «Sin responder».
  Al contestarle, sale.
- **AC2.** Una nota interna no la saca de «Sin responder».
- **AC3.** Una conversación cuyo último entrante es de hace 22 h 30 min
  aparece en «Por vencer», con el chip «Vence en 1 h 30 min» (aprox.). Una de
  hace 1 h no aparece. Una de hace 30 h, con la ventana cerrada, tampoco.
- **AC4.** Sin conversaciones por vencer, no se pinta el botón «Por vencer».
- **AC5.** Los filtros se combinan con la búsqueda, la etapa y el canal, como
  los de siempre.
- **AC6.** A 390 px la fila de filtros envuelve sin desplazamiento horizontal.

## Qué NO se hace y por qué

- **Avisos o notificaciones de «por vencer»**: necesitan notificaciones por
  persona, que todavía no existen (lo mismo que las menciones de la 050).
- **Umbral configurable**: 2 h es el margen de wacrm y da tiempo de contestar.
  Si alguien pide otro, se agrega.
- **Ordenar por urgencia**: la lista sigue por actividad, como WhatsApp. El
  filtro ya trae lo urgente arriba.

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I · Seguridad | Sin datos ni secretos nuevos |
| II · Soberanía | Sin dependencias |
| III · Multi-tenancy | La subconsulta va dentro de la consulta ya acotada con `scoped()` |
| IV · Idempotencia | Solo lectura |
| V · Hecho | Unitarias de los filtros y del chip, arnés E2E con Playwright, los cuatro gates |
| VI · Specs | Este documento, antes del código; carril ligero (un campo de la API interna, como la 028) |
| VIII · Foco | No perder la ventana de WhatsApp con un cliente que espera |
| IX · En vivo | El arnés crea conversaciones con distintas horas y comprueba la lista real |
