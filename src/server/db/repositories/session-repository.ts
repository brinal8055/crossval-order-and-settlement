import type { Collection } from "mongodb";

import type { SessionDocument } from "../documents";
import { mapSessionDocument } from "../mappers";

export class SessionRepository {
  constructor(private readonly collection: Collection<SessionDocument>) {}

  findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<SessionDocument | null> {
    return this.collection
      .findOne({ tokenHash, expiresAt: { $gt: now } })
      .then((document) => (document ? mapSessionDocument(document) : null));
  }

  async insert(document: SessionDocument): Promise<void> {
    await this.collection.insertOne(document);
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.collection.deleteOne({ tokenHash });
  }
}
