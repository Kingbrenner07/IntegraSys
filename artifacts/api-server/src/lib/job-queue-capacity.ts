export const MAX_CONCURRENT_PROCESSING_JOBS = 1;
export const MAX_WAITING_PROCESSING_JOBS = 20;
export const MAX_BUFFERED_PROCESSING_BYTES = 300 * 1024 * 1024;

export class JobQueueCapacity {
  private bufferedBytes = 0;
  private bufferedJobs = 0;

  constructor(
    private readonly maxJobs: number,
    private readonly maxBytes: number,
  ) {}

  reserve(bytes: number): (() => void) | null {
    if (
      bytes < 0 ||
      this.bufferedJobs >= this.maxJobs ||
      this.bufferedBytes + bytes > this.maxBytes
    ) {
      return null;
    }

    this.bufferedJobs += 1;
    this.bufferedBytes += bytes;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.bufferedJobs -= 1;
      this.bufferedBytes -= bytes;
    };
  }
}