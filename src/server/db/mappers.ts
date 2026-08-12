import type {
  OrderDocument,
  PaymentDocument,
  RefundDocument,
  SessionDocument,
  UserDocument,
} from "./documents";
import { fromBsonMoney, toBsonMoney } from "./money-mapper";

export function mapUserDocument(document: UserDocument): UserDocument {
  return { ...document };
}

export function mapSessionDocument(document: SessionDocument): SessionDocument {
  return { ...document };
}

export function mapOrderDocument(document: OrderDocument): OrderDocument {
  return {
    ...document,
    lines: document.lines.map((line) => ({
      ...line,
      unitPriceCents: fromBsonMoney(line.unitPriceCents, "unitPriceCents"),
    })),
    totalCents: fromBsonMoney(document.totalCents, "totalCents"),
    amountDueCents: fromBsonMoney(
      document.amountDueCents,
      "amountDueCents",
    ),
  };
}

export function mapPaymentDocument(document: PaymentDocument): PaymentDocument {
  return {
    ...document,
    amountCents: fromBsonMoney(document.amountCents, "amountCents"),
    balanceBeforeCents: fromBsonMoney(
      document.balanceBeforeCents,
      "balanceBeforeCents",
    ),
    balanceAfterCents: fromBsonMoney(
      document.balanceAfterCents,
      "balanceAfterCents",
    ),
  };
}

export function mapRefundDocument(document: RefundDocument): RefundDocument {
  return {
    ...document,
    amountCents: fromBsonMoney(document.amountCents, "amountCents"),
    balanceBeforeCents: fromBsonMoney(document.balanceBeforeCents, "balanceBeforeCents"),
    balanceAfterCents: fromBsonMoney(document.balanceAfterCents, "balanceAfterCents"),
  };
}

export function mapOrderForPersistence(document: OrderDocument): OrderDocument {
  return {
    ...document,
    lines: document.lines.map((line) => ({
      ...line,
      unitPriceCents: toBsonMoney(line.unitPriceCents),
    })),
    totalCents: toBsonMoney(document.totalCents),
    amountDueCents: toBsonMoney(document.amountDueCents),
  };
}

export function mapPaymentForPersistence(
  document: PaymentDocument,
): PaymentDocument {
  return {
    ...document,
    amountCents: toBsonMoney(document.amountCents),
    balanceBeforeCents: toBsonMoney(document.balanceBeforeCents),
    balanceAfterCents: toBsonMoney(document.balanceAfterCents),
  };
}

export function mapRefundForPersistence(document: RefundDocument): RefundDocument {
  return {
    ...document,
    amountCents: toBsonMoney(document.amountCents),
    balanceBeforeCents: toBsonMoney(document.balanceBeforeCents),
    balanceAfterCents: toBsonMoney(document.balanceAfterCents),
  };
}
