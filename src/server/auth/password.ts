import argon2 from "argon2";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$KjuiXrIx7mG6Nl5XGFCVhA$6y4YTn3a1CiISJh9hOXncKZ1oKU0o4BPv3ikl1dU6UU";

export function validatePassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  password: string,
  passwordHash: string | undefined,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash ?? DUMMY_PASSWORD_HASH, password);
  } catch {
    return false;
  }
}
