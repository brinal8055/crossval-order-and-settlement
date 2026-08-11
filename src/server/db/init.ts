import type { Db, IndexDescription } from "mongodb";

import { collectionValidators } from "./validators";

const collectionNames = ["users", "sessions", "orders", "payments"] as const;

const indexes: Record<(typeof collectionNames)[number], IndexDescription[]> = {
  users: [{ key: { emailNormalized: 1 }, unique: true }],
  sessions: [
    { key: { tokenHash: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    { key: { userId: 1 } },
  ],
  orders: [
    { key: { userId: 1, createdAt: -1 } },
    { key: { userId: 1, amountDueCents: 1, createdAt: -1 } },
    { key: { userId: 1, dueDate: 1 } },
  ],
  payments: [
    { key: { userId: 1, idempotencyKey: 1 }, unique: true },
    { key: { userId: 1, orderId: 1, sequence: -1 } },
    { key: { userId: 1, orderId: 1, sequence: 1 }, unique: true },
  ],
};

export async function initializeDatabase(db: Db): Promise<void> {
  for (const name of collectionNames) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();

    if (!exists) {
      await db.createCollection(name, {
        validator: collectionValidators[name],
        validationLevel: "strict",
        validationAction: "error",
      });
    } else {
      await db.command({
        collMod: name,
        validator: collectionValidators[name],
        validationLevel: "strict",
        validationAction: "error",
      });
    }

    await db.collection(name).createIndexes(indexes[name]);
  }
}

