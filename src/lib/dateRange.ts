const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

function parseDateOnlyParts(value: string): DateOnlyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Parse a YYYY-MM-DD value as the UTC date-only sentinel stored by Prisma. */
export function parseDateOnlyUtc(value: string): Date | null {
  const parts = parseDateOnlyParts(value);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/** Start of a Shanghai business date, represented as a UTC Date. */
export function parseDateOnlyStart(value: string): Date | null {
  const sentinel = parseDateOnlyUtc(value);
  if (!sentinel) return null;
  return new Date(sentinel.getTime() - SHANGHAI_UTC_OFFSET_MS);
}

/** End of a Shanghai business date, retained for existing inclusive filters. */
export function parseDateOnlyEnd(value: string): Date | null {
  const start = parseDateOnlyStart(value);
  if (!start) return null;
  return new Date(start.getTime() + ONE_DAY_MS - 1);
}

/**
 * Convert persisted UTC date-only sentinels to a Shanghai natural-day range.
 * The returned interval is half-open: [start 00:00, day-after-end 00:00).
 */
export function shanghaiDateRangeFromUtcSentinels(
  periodStart: Date,
  periodEnd: Date,
): { gte: Date; lt: Date } {
  const startSentinel = Date.UTC(
    periodStart.getUTCFullYear(),
    periodStart.getUTCMonth(),
    periodStart.getUTCDate(),
  );
  const endSentinel = Date.UTC(
    periodEnd.getUTCFullYear(),
    periodEnd.getUTCMonth(),
    periodEnd.getUTCDate(),
  );

  return {
    gte: new Date(startSentinel - SHANGHAI_UTC_OFFSET_MS),
    lt: new Date(endSentinel + ONE_DAY_MS - SHANGHAI_UTC_OFFSET_MS),
  };
}
