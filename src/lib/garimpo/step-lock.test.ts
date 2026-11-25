import { describe, expect, it, vi } from "vitest";
import { claimStepLease, hasStepLease, STEP_LEASE_MS, stepLeaseUntil } from "./step-lock";

const now = Date.parse("2026-11-25T14:00:00Z");
const initial = { status: "running", updated_at: new Date(now - 1000).toISOString(), cursor: 0 };

describe("trava de etapa do garimpo", () => {
  it("duas chamadas com o mesmo checkpoint têm apenas uma vencedora", async () => {
    let row = { ...initial };
    const cas = async (expected: string, until: string) => {
      await Promise.resolve();
      if (row.status !== "running" || row.updated_at !== expected) return null;
      row = { ...row, updated_at: until };
      return row;
    };
    const results = await Promise.all([
      claimStepLease(initial, cas, now),
      claimStepLease(initial, cas, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(hasStepLease(row.updated_at, now)).toBe(true);
  });

  it("não consulta o banco para assumir uma trava ainda válida", async () => {
    const cas = vi.fn(async () => initial);
    const row = { ...initial, updated_at: stepLeaseUntil(initial.updated_at, now) };
    expect(await claimStepLease(row, cas, now)).toBeNull();
    expect(cas).not.toHaveBeenCalled();
  });

  it("permite recuperar a execução quando a trava expira", async () => {
    const row = { ...initial, updated_at: stepLeaseUntil(initial.updated_at, now) };
    const later = now + STEP_LEASE_MS;
    const cas = vi.fn(async (_expected: string, until: string) => ({ ...row, updated_at: until }));
    expect(await claimStepLease(row, cas, later)).not.toBeNull();
    expect(cas).toHaveBeenCalledWith(row.updated_at, stepLeaseUntil(row.updated_at, later));
  });

  it("não retoma execução concluída", async () => {
    const cas = vi.fn(async () => initial);
    expect(await claimStepLease({ ...initial, status: "ok" }, cas, now)).toBeNull();
    expect(cas).not.toHaveBeenCalled();
  });

  it("renovação mantém identificador de trava monotônico no mesmo milissegundo", () => {
    const first = stepLeaseUntil(initial.updated_at, now);
    expect(stepLeaseUntil(first, now) > first).toBe(true);
  });
});
