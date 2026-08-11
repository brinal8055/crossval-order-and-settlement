export type DomainErrorCode =
  | "INVALID_MONEY"
  | "MONEY_LIMIT_EXCEEDED"
  | "INVALID_DATE"
  | "INVALID_QUANTITY"
  | "INVALID_LINE_ITEMS"
  | "INVALID_ORDER_TOTAL"
  | "INVALID_BALANCE"
  | "ZERO_TOTAL_ORDER";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

