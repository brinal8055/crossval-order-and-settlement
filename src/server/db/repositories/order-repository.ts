import type { ClientSession, Collection, Filter, ObjectId } from "mongodb";

import type { OrderStatus } from "@/domain/order-status";
import type { OrderDocument } from "../documents";
import { mapOrderDocument, mapOrderForPersistence } from "../mappers";
import { toBsonMoney } from "../money-mapper";

export interface OrderListFilter {
  userId: ObjectId;
  today: string;
  status?: OrderStatus;
  skip: number;
  limit: number;
}

export interface OrderPatch {
  customer?: string;
  dueDate?: string;
  lines?: OrderDocument["lines"];
  totalCents?: bigint;
  amountDueCents?: bigint;
}

export class OrderRepository {
  constructor(private readonly collection: Collection<OrderDocument>) {}

  findByIdForUser(
    orderId: ObjectId,
    userId: ObjectId,
  ): Promise<OrderDocument | null> {
    return this.collection
      .findOne(this.tenantFilter(orderId, userId))
      .then((document) => (document ? mapOrderDocument(document) : null));
  }

  async insert(document: OrderDocument): Promise<void> {
    await this.collection.insertOne(mapOrderForPersistence(document));
  }

  async listForUser(filter: OrderListFilter): Promise<{
    orders: OrderDocument[];
    total: number;
  }> {
    const query: Filter<OrderDocument> = { userId: filter.userId };
    if (filter.status === "paid") query.amountDueCents = 0n;
    if (filter.status === "overdue") {
      query.amountDueCents = { $gt: 0n };
      query.dueDate = { $lt: filter.today };
    }
    if (filter.status === "pending") {
      query.amountDueCents = { $gt: 0n };
      query.dueDate = { $gte: filter.today };
      query.paymentCount = 0;
    }
    if (filter.status === "partially_paid") {
      query.amountDueCents = { $gt: 0n };
      query.dueDate = { $gte: filter.today };
      query.paymentCount = { $gt: 0 };
    }

    const [documents, total] = await Promise.all([
      this.collection
        .find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip(filter.skip)
        .limit(filter.limit)
        .toArray(),
      this.collection.countDocuments(query),
    ]);

    return { orders: documents.map(mapOrderDocument), total };
  }

  async updateBeforePayment(
    orderId: ObjectId,
    userId: ObjectId,
    expectedVersion: number,
    patch: OrderPatch,
    updatedAt: Date,
  ): Promise<OrderDocument | null> {
    const update: {
      $set: Record<string, unknown>;
      $inc: { version: 1 };
    } = { $set: { updatedAt }, $inc: { version: 1 } };
    if (patch.customer !== undefined) update.$set.customer = patch.customer;
    if (patch.dueDate !== undefined) update.$set.dueDate = patch.dueDate;
    if (patch.lines !== undefined) {
      update.$set.lines = patch.lines.map((line) => ({
        ...line,
        unitPriceCents: toBsonMoney(line.unitPriceCents),
      }));
    }
    if (patch.totalCents !== undefined) {
      update.$set.totalCents = toBsonMoney(patch.totalCents);
    }
    if (patch.amountDueCents !== undefined) {
      update.$set.amountDueCents = toBsonMoney(patch.amountDueCents);
    }

    const document = await this.collection.findOneAndUpdate(
      { _id: orderId, userId, paymentCount: 0, version: expectedVersion },
      update,
      { returnDocument: "after" },
    );
    return document ? mapOrderDocument(document) : null;
  }

  async deleteBeforePayment(
    orderId: ObjectId,
    userId: ObjectId,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: orderId,
      userId,
      paymentCount: 0,
      version: expectedVersion,
    });
    return result.deletedCount === 1;
  }

  async settle(
    orderId: ObjectId,
    userId: ObjectId,
    amountCents: bigint,
    updatedAt: Date,
    session: ClientSession,
  ): Promise<OrderDocument | null> {
    const document = await this.collection.findOneAndUpdate(
      { _id: orderId, userId, amountDueCents: { $gte: amountCents } },
      {
        $inc: { amountDueCents: -amountCents, paymentCount: 1, version: 1 },
        $set: { updatedAt },
      },
      { returnDocument: "before", session },
    );
    return document ? mapOrderDocument(document) : null;
  }

  private tenantFilter(orderId: ObjectId, userId: ObjectId): Filter<OrderDocument> {
    return { _id: orderId, userId };
  }
}
