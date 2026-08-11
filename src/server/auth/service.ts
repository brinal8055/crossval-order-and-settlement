import { ObjectId } from "mongodb";

import type { AppEnvironment } from "../config/env";
import type { UserDocument } from "../db/documents";
import { UserRepository } from "../db/repositories/user-repository";
import { SessionRepository } from "../db/repositories/session-repository";
import { hashPassword, verifyPassword } from "./password";
import {
  createSessionToken,
  hashSessionToken,
  sessionExpiry,
} from "./session";

export interface AuthRepositories {
  users: UserRepository;
  sessions: SessionRepository;
}

export interface PublicUser {
  id: string;
  email: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: UserDocument): PublicUser {
  return { id: user._id.toHexString(), email: user.email };
}

async function createSession(
  user: UserDocument,
  repositories: AuthRepositories,
  environment: AppEnvironment,
  now: Date,
): Promise<AuthResult> {
  const token = createSessionToken();
  await repositories.sessions.insert({
    _id: new ObjectId(),
    userId: user._id,
    tokenHash: hashSessionToken(token),
    expiresAt: sessionExpiry(now, environment.SESSION_TTL_SECONDS),
    createdAt: now,
  });
  return { user: toPublicUser(user), token };
}

export async function signup(
  email: string,
  password: string,
  repositories: AuthRepositories,
  environment: AppEnvironment,
  now: Date,
): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  const user: UserDocument = {
    _id: new ObjectId(),
    email: email.trim(),
    emailNormalized: normalizedEmail,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };

  await repositories.users.insert(user);
  return createSession(user, repositories, environment, now);
}

export async function login(
  email: string,
  password: string,
  repositories: AuthRepositories,
  environment: AppEnvironment,
  now: Date,
): Promise<AuthResult | null> {
  const user = await repositories.users.findByEmailNormalized(normalizeEmail(email));
  const passwordMatches = await verifyPassword(password, user?.passwordHash);
  if (!user || !passwordMatches) return null;
  return createSession(user, repositories, environment, now);
}

export async function authenticate(
  token: string | undefined,
  repositories: AuthRepositories,
  now: Date,
): Promise<PublicUser | null> {
  if (!token) return null;
  const session = await repositories.sessions.findActiveByTokenHash(
    hashSessionToken(token),
    now,
  );
  if (!session) return null;
  const user = await repositories.users.findById(session.userId);
  return user ? toPublicUser(user) : null;
}

export async function logout(
  token: string | undefined,
  repositories: AuthRepositories,
): Promise<void> {
  if (token) await repositories.sessions.deleteByTokenHash(hashSessionToken(token));
}
