// Floor for reset-request responses, so timing does not reveal whether an
// address exists. Mutable for tests only.
export const resetRequestTiming = { minResponseMs: 1000 };

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
