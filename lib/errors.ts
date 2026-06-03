// Under `strict`, a caught value is typed `unknown`, so `error.message` is a
// type error. These helpers narrow it in one place.

export function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

/** True when `error` is an object carrying the given property. */
export function hasProp<K extends string>(
  error: unknown,
  key: K,
): error is Record<K, unknown> {
  return typeof error === "object" && error !== null && key in error;
}
