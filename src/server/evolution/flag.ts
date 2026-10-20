/** Conector optativo del fork: no cambia la instalación predeterminada. */
export function evolutionEnabled(): boolean {
  return process.env.EVOLUTION_GO === "on";
}
