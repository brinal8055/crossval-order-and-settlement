import { DomainError } from "./errors";

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidBusinessDate(value: string): boolean {
  const match = BUSINESS_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function assertValidBusinessDate(value: string): void {
  if (!isValidBusinessDate(value)) {
    throw new DomainError(
      "INVALID_DATE",
      "Date must be a valid calendar date in YYYY-MM-DD format.",
    );
  }
}

export function formatUtcDate(value: Date): string {
  const year = value.getUTCFullYear().toString().padStart(4, "0");
  const month = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = value.getUTCDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}
