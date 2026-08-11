import { MongoClient } from "mongodb";

import { readEnvironment } from "../config/env";

let client: MongoClient | undefined;
let clientUri: string | undefined;

export function createMongoClient(uri: string): MongoClient {
  return new MongoClient(uri, {
    useBigInt64: true,
  });
}

export function getMongoClient(uri = readEnvironment().MONGODB_URI): MongoClient {
  if (!client) {
    client = createMongoClient(uri);
    clientUri = uri;
  } else if (clientUri !== uri) {
    throw new Error("MongoClient has already been configured with another URI.");
  }

  return client;
}

export async function connectMongo(
  uri = readEnvironment().MONGODB_URI,
): Promise<MongoClient> {
  const currentClient = getMongoClient(uri);
  await currentClient.connect();
  return currentClient;
}

export async function closeMongoClient(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
    clientUri = undefined;
  }
}

