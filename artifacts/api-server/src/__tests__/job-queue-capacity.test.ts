import { describe, expect, it } from "vitest";
import { JobQueueCapacity } from "../lib/job-queue-capacity";

describe("limites da fila de processamento", () => {
  it("recusa novos trabalhos ao atingir o limite de quantidade", () => {
    const capacity = new JobQueueCapacity(2, 1_000);
    expect(capacity.reserve(10)).toBeTypeOf("function");
    expect(capacity.reserve(10)).toBeTypeOf("function");
    expect(capacity.reserve(10)).toBeNull();
  });

  it("recusa novos trabalhos ao ultrapassar o limite de bytes", () => {
    const capacity = new JobQueueCapacity(10, 100);
    expect(capacity.reserve(60)).toBeTypeOf("function");
    expect(capacity.reserve(41)).toBeNull();
  });

  it("libera a capacidade uma única vez após o processamento", () => {
    const capacity = new JobQueueCapacity(1, 100);
    const release = capacity.reserve(100);
    expect(release).toBeTypeOf("function");
    expect(capacity.reserve(1)).toBeNull();

    release?.();
    release?.();
    expect(capacity.reserve(100)).toBeTypeOf("function");
  });
});