import { describe, expect, it } from "vitest";
import {
  JobQueueCapacity,
  MAX_BUFFERED_PROCESSING_BYTES,
  MAX_CONCURRENT_PROCESSING_JOBS,
  MAX_WAITING_PROCESSING_JOBS,
} from "../lib/job-queue-capacity";

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

  it("aceita vinte trabalhos aguardando além do trabalho em processamento", () => {
    const totalJobs =
      MAX_CONCURRENT_PROCESSING_JOBS + MAX_WAITING_PROCESSING_JOBS;
    const capacity = new JobQueueCapacity(
      totalJobs,
      MAX_BUFFERED_PROCESSING_BYTES,
    );

    for (let index = 0; index < totalJobs; index += 1) {
      expect(capacity.reserve(1024)).toBeTypeOf("function");
    }
    expect(capacity.reserve(1024)).toBeNull();
  });
});