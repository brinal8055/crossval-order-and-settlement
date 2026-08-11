import type { Collection } from "mongodb";

import type { UserDocument } from "../documents";
import { mapUserDocument } from "../mappers";

export class UserRepository {
  constructor(private readonly collection: Collection<UserDocument>) {}

  findByEmailNormalized(emailNormalized: string): Promise<UserDocument | null> {
    return this.collection
      .findOne({ emailNormalized })
      .then((document) => (document ? mapUserDocument(document) : null));
  }

  findById(id: UserDocument["_id"]): Promise<UserDocument | null> {
    return this.collection
      .findOne({ _id: id })
      .then((document) => (document ? mapUserDocument(document) : null));
  }

  async insert(document: UserDocument): Promise<void> {
    await this.collection.insertOne(document);
  }
}

