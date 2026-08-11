import { MongoClient } from "mongodb";

import { readEnvironment } from "../src/server/config/env";
import { initializeDatabase } from "../src/server/db/init";

const environment = readEnvironment();
const migrationUri = environment.MONGODB_MIGRATION_URI ?? environment.MONGODB_URI;
const client = new MongoClient(migrationUri, {
  useBigInt64: true,
});

try {
  await client.connect();
  await initializeDatabase(client.db(environment.MONGODB_DATABASE));
  console.info(`MongoDB schema initialized for ${environment.MONGODB_DATABASE}.`);
} finally {
  await client.close();
}
