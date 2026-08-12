import type { ClientSession, Collection, ObjectId } from "mongodb";

import type { AuditEventDocument } from "../documents";

export class AuditRepository {
  constructor(private readonly collection: Collection<AuditEventDocument>) {}

  async insert(document: AuditEventDocument, session?: ClientSession): Promise<void> {
    await this.collection.insertOne(document, { session });
  }

  findByOrderForUser(orderId: ObjectId, userId: ObjectId): Promise<AuditEventDocument[]> {
    return this.collection
      .find({ orderId, userId })
      .sort({ occurredAt: -1, _id: -1 })
      .toArray();
  }
}
