import type { Collection, Db } from "mongodb";

import type {
  OrderDocument,
  PaymentDocument,
  AuditEventDocument,
  RefundDocument,
  SessionDocument,
  UserDocument,
} from "./documents";

export interface DatabaseCollections {
  users: Collection<UserDocument>;
  sessions: Collection<SessionDocument>;
  orders: Collection<OrderDocument>;
  payments: Collection<PaymentDocument>;
  auditEvents: Collection<AuditEventDocument>;
  refunds: Collection<RefundDocument>;
}

export function getCollections(db: Db): DatabaseCollections {
  return {
    users: db.collection<UserDocument>("users"),
    sessions: db.collection<SessionDocument>("sessions"),
    orders: db.collection<OrderDocument>("orders"),
    payments: db.collection<PaymentDocument>("payments"),
    auditEvents: db.collection<AuditEventDocument>("auditEvents"),
    refunds: db.collection<RefundDocument>("refunds"),
  };
}
