import type { ClientSession, Collection, ObjectId } from "mongodb";

import type { RefundDocument } from "../documents";
import { mapRefundDocument, mapRefundForPersistence } from "../mappers";

export class RefundRepository {
  constructor(private readonly collection: Collection<RefundDocument>) {}

  findByIdempotencyKey(userId: ObjectId, idempotencyKey: string, session?: ClientSession): Promise<RefundDocument | null> {
    return this.collection
      .findOne({ userId, idempotencyKey }, { session })
      .then((document) => (document ? mapRefundDocument(document) : null));
  }

  findByOrderForUser(orderId: ObjectId, userId: ObjectId, session?: ClientSession): Promise<RefundDocument[]> {
    return this.collection
      .find({ userId, orderId }, { session })
      .sort({ sequence: -1 })
      .toArray()
      .then((documents) => documents.map(mapRefundDocument));
  }

  async insert(document: RefundDocument, session?: ClientSession): Promise<void> {
    await this.collection.insertOne(mapRefundForPersistence(document), { session });
  }
}
