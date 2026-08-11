import type { ClientSession, Collection, ObjectId } from "mongodb";

import type { PaymentDocument } from "../documents";
import { mapPaymentDocument, mapPaymentForPersistence } from "../mappers";

export class PaymentRepository {
  constructor(private readonly collection: Collection<PaymentDocument>) {}

  findByIdempotencyKey(
    userId: ObjectId,
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<PaymentDocument | null> {
    return this.collection
      .findOne({ userId, idempotencyKey }, { session })
      .then((document) => (document ? mapPaymentDocument(document) : null));
  }

  findByOrderForUser(
    orderId: ObjectId,
    userId: ObjectId,
    session?: ClientSession,
  ): Promise<PaymentDocument[]> {
    return this.collection
      .find({ userId, orderId }, { session })
      .sort({ sequence: -1 })
      .toArray()
      .then((documents) => documents.map(mapPaymentDocument));
  }

  async insert(document: PaymentDocument, session?: ClientSession): Promise<void> {
    await this.collection.insertOne(mapPaymentForPersistence(document), { session });
  }
}
