import { connectMongo } from "../db/client";
import { getCollections } from "../db/collections";
import { readEnvironment } from "../config/env";
import { SessionRepository } from "../db/repositories/session-repository";
import { UserRepository } from "../db/repositories/user-repository";
import { SESSION_COOKIE_NAME } from "./session";
import { authenticate } from "./service";

export const AUTH_RUNTIME = "nodejs";

export async function getAuthContext() {
  const environment = readEnvironment();
  const client = await connectMongo(environment.MONGODB_URI);
  const collections = getCollections(client.db(environment.MONGODB_DATABASE));
  return {
    environment,
    client,
    collections,
    repositories: {
      users: new UserRepository(collections.users),
      sessions: new SessionRepository(collections.sessions),
    },
  };
}

export async function authenticateRequest(request: Request) {
  const context = await getAuthContext();
  const token = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  const user = await authenticate(token, context.repositories, new Date());
  return { ...context, token, user };
}
