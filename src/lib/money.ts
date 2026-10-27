/** Money is stored as integer centavos. */

const formatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function formatPeso(centavos: number) {
  return formatter.format(centavos / 100);
}

export function pesosToCentavos(pesos: number | string) {
  const n = typeof pesos === "string" ? Number(pesos.replace(/[,₱\s]/g, "")) : pesos;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${pesos}`);
  return Math.round(n * 100);
}

export function centavosToPesos(centavos: number) {
  return centavos / 100;
}

/** Round half away from zero to the nearest centavo. */
export function roundCentavos(value: number) {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON * 10);
}
