export function toBsonMoney(value: bigint): bigint {
  if (typeof value !== "bigint") {
    throw new TypeError("Persisted monetary values must be bigint.");
  }

  return value;
}

export function fromBsonMoney(value: unknown, fieldName: string): bigint {
  if (typeof value !== "bigint") {
    throw new TypeError(`${fieldName} was not deserialized as bigint.`);
  }

  return value;
}

