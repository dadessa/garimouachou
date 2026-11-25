/** Lease de etapa sem migração: updated_at no futuro representa uma trava temporária.
 * Fora da trava, updated_at volta a ser a data do último checkpoint.
 */
export const STEP_LEASE_MS = 5 * 60_000;

export class StepLeaseLostError extends Error {
  constructor() {
    super("A trava do garimpo expirou ou foi assumida por outra chamada.");
  }
}

export function hasStepLease(updatedAt: string, now = Date.now()) {
  return new Date(updatedAt).getTime() > now;
}

export function stepLeaseUntil(previous: string, now = Date.now()) {
  const prior = new Date(previous).getTime();
  return new Date(
    Math.max(now + STEP_LEASE_MS, Number.isFinite(prior) ? prior + 1 : 0),
  ).toISOString();
}

/** O callback deve executar UPDATE ... WHERE updated_at = expected AND status = 'running'
 * e retornar a linha realmente atualizada, ou null se a comparação falhar.
 */
export async function claimStepLease<T extends { status: string; updated_at: string }>(
  row: T,
  compareAndSet: (expected: string, until: string) => Promise<T | null>,
  now = Date.now(),
): Promise<T | null> {
  if (row.status !== "running" || hasStepLease(row.updated_at, now)) return null;
  return compareAndSet(row.updated_at, stepLeaseUntil(row.updated_at, now));
}
