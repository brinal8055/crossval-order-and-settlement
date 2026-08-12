import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";

import { getCollections } from "@/server/db/collections";
import { initializeDatabase } from "@/server/db/init";
import { fromBsonMoney } from "@/server/db/money-mapper";
import { OrderRepository } from "@/server/db/repositories/order-repository";
import { PaymentRepository } from "@/server/db/repositories/payment-repository";
import { SessionRepository } from "@/server/db/repositories/session-repository";
import { UserRepository } from "@/server/db/repositories/user-repository";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as signupPost } from "@/app/api/auth/signup/route";
import { POST as createOrderPost, GET as listOrdersGet } from "@/app/api/orders/route";
import {
  DELETE as deleteOrderRoute,
  GET as getOrderRoute,
  PATCH as patchOrderRoute,
} from "@/app/api/orders/[orderId]/route";
import {
  GET as getPaymentsRoute,
  POST as createPaymentPost,
} from "@/app/api/orders/[orderId]/payments/route";
import { GET as getRefundsRoute, POST as createRefundPost } from "@/app/api/orders/[orderId]/refunds/route";
import { GET as getAuditRoute } from "@/app/api/orders/[orderId]/audit/route";
import { GET as exportOrdersRoute } from "@/app/api/orders/export/route";
import { hashSessionToken } from "@/server/auth/session";
import { GET as healthLiveGet } from "@/app/api/health/live/route";
import { GET as healthReadyGet } from "@/app/api/health/ready/route";

const configuredMongoUri =
  process.env.MONGODB_TEST_URI ??
  "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const configuredDatabasePrefix = process.env.MONGODB_TEST_DATABASE;
const remoteTestOverride = process.env.ALLOW_REMOTE_MONGODB_TEST === "true";

function assertSafeTestConfiguration(uri: string, databasePrefix: string | undefined) {
  const parsedUri = new URL(uri);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const hostname = parsedUri.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!remoteTestOverride && !localHosts.has(hostname)) {
    throw new Error(
      "Integration tests require MONGODB_TEST_URI to use localhost, 127.0.0.1, or ::1. Set ALLOW_REMOTE_MONGODB_TEST=true only for an intentional remote test.",
    );
  }
  if (databasePrefix && !/(?:_test|_integration)$/.test(databasePrefix)) {
    throw new Error("MONGODB_TEST_DATABASE must end with _test or _integration.");
  }
}

assertSafeTestConfiguration(configuredMongoUri, configuredDatabasePrefix);

const runId = `${process.pid}_${Date.now()}_${randomUUID().slice(0, 8)}`;
const mongoUri = configuredMongoUri;
const mongoDatabase = `${configuredDatabasePrefix ?? "crossval_orders"}_${runId}_test`;

const client = new MongoClient(mongoUri, { useBigInt64: true });

describe("local MongoDB", () => {
  beforeAll(async () => {
    process.env.APP_ORIGIN = "http://localhost:3000";
    process.env.MONGODB_URI = mongoUri;
    process.env.MONGODB_DATABASE = mongoDatabase;
    await client.connect();
  });

  beforeEach(async () => {
    await client.db(mongoDatabase).dropDatabase();
    await initializeDatabase(client.db(mongoDatabase));
  });

  afterAll(async () => {
    await client.db(mongoDatabase).dropDatabase();
    await client.close();
  });

  it("runs as a writable replica-set primary", async () => {
    const hello = await client.db("admin").command({ hello: 1 });

    expect(hello.setName).toBe("rs0");
    expect(hello.isWritablePrimary).toBe(true);
    expect((await healthLiveGet(new Request("http://localhost:3000/api/health/live"))).status).toBe(200);
    expect((await healthReadyGet(new Request("http://localhost:3000/api/health/ready"))).status).toBe(200);
  });

  it("initializes validators and indexes idempotently", async () => {
    const db = client.db(mongoDatabase);

    await initializeDatabase(db);

    const collectionNames = await db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const names = collectionNames.map(({ name }) => name);

    expect(names).toEqual(expect.arrayContaining(["users", "sessions", "orders", "payments", "refunds", "auditEvents"]));
    expect((await db.collection("users").indexes()).some((index) => index.unique)).toBe(
      true,
    );
    expect(
      (await db.collection("sessions").indexes()).some(
        (index) => index.expireAfterSeconds === 0,
      ),
    ).toBe(true);
  });

  it("rejects invalid documents through MongoDB validators", async () => {
    const collections = getCollections(client.db(mongoDatabase));

    await expect(
      collections.orders.insertOne({
        _id: new ObjectId(),
        userId: new ObjectId(),
        customer: "Invalid",
        dueDate: "2026-08-10",
        currency: "EUR",
        lines: [],
        totalCents: 100n,
        amountDueCents: 100n,
        paymentCount: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never),
    ).rejects.toThrow();
  });

  it("round-trips int64 money as bigint beyond Number.MAX_SAFE_INTEGER", async () => {
    const collection = client
      .db(mongoDatabase)
      .collection<{ _id: ObjectId; amountCents: bigint }>(
        "persistence_codec_fixtures",
      );
    const amountCents = 9_007_199_254_740_993n;

    await collection.deleteMany({});
    await collection.insertOne({ _id: new ObjectId(), amountCents });

    const stored = await collection.findOne({ amountCents });

    expect(stored).not.toBeNull();
    expect(typeof stored?.amountCents).toBe("bigint");
    expect(fromBsonMoney(stored?.amountCents, "amountCents")).toBe(amountCents);
  });

  it("enforces unique indexes and repository tenant/expiry predicates", async () => {
    const collections = getCollections(client.db(mongoDatabase));
    const aliceId = new ObjectId();
    const bobId = new ObjectId();
    const orderId = new ObjectId();
    const now = new Date();

    const alice = {
      _id: aliceId,
      email: "alice@example.com",
      emailNormalized: "alice@example.com",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    };
    await collections.users.insertOne(alice);
    const userRepository = new UserRepository(collections.users);
    expect(await userRepository.findByEmailNormalized("alice@example.com")).not.toBeNull();
    await expect(
      collections.users.insertOne({ ...alice, _id: new ObjectId() }),
    ).rejects.toThrow();

    const order = {
      _id: orderId,
      userId: aliceId,
      customer: "Acme",
      dueDate: "2026-08-20",
      currency: "USD" as const,
      lines: [
        {
          id: "line-1",
          description: "Service",
          quantity: 1,
          unitPriceCents: 100n,
        },
      ],
      totalCents: 100n,
      amountDueCents: 100n,
      paymentCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await collections.orders.insertOne(order);

    const orderRepository = new OrderRepository(collections.orders);
    expect(await orderRepository.findByIdForUser(orderId, aliceId)).not.toBeNull();
    expect(await orderRepository.findByIdForUser(orderId, bobId)).toBeNull();

    await collections.sessions.insertMany([
      {
        _id: new ObjectId(),
        userId: aliceId,
        tokenHash: "active-token",
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
      },
      {
        _id: new ObjectId(),
        userId: aliceId,
        tokenHash: "expired-token",
        expiresAt: new Date(now.getTime() - 60_000),
        createdAt: now,
      },
    ]);
    const sessionRepository = new SessionRepository(collections.sessions);
    expect(
      await sessionRepository.findActiveByTokenHash("active-token", now),
    ).not.toBeNull();
    expect(
      await sessionRepository.findActiveByTokenHash("expired-token", now),
    ).toBeNull();

    const payment = {
      _id: new ObjectId(),
      userId: aliceId,
      orderId,
      sequence: 1,
      amountCents: 100n,
      paymentDate: "2026-08-10",
      idempotencyKey: "payment-key",
      requestHash: "request-hash",
      balanceBeforeCents: 100n,
      balanceAfterCents: 0n,
      recordedAt: now,
    };
    await collections.payments.insertOne(payment);
    const paymentRepository = new PaymentRepository(collections.payments);
    expect(
      await paymentRepository.findByIdempotencyKey(aliceId, "payment-key"),
    ).not.toBeNull();
    expect(
      await paymentRepository.findByOrderForUser(orderId, bobId),
    ).toEqual([]);
    await expect(
      collections.payments.insertOne({ ...payment, _id: new ObjectId() }),
    ).rejects.toThrow();
  });

  it("supports signup, login, current-user, logout, and logical session expiry", async () => {
    const email = `auth-${Date.now()}@example.com`;
    const password = "correct horse battery staple";
    const signupResponse = await signupPost(
      new Request("http://localhost:3000/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      }),
    );

    expect(signupResponse.status).toBe(201);
    expect(signupResponse.headers.get("cache-control")).toBe("private, no-store");
    const setCookie = signupResponse.headers.get("set-cookie");
    const token = setCookie?.match(/crossval_session=([^;]+)/)?.[1];
    expect(token).toBeTruthy();

    const duplicateSignupResponse = await signupPost(
      new Request("http://localhost:3000/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      }),
    );
    expect(duplicateSignupResponse.status).toBe(409);

    const meResponse = await meGet(
      new Request("http://localhost:3000/api/auth/me", {
        headers: { cookie: `crossval_session=${token}` },
      }),
    );
    expect(meResponse.status).toBe(200);
    expect((await meResponse.json()).user.email).toBe(email);

    const badLoginResponse = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: "wrong-password" }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      }),
    );
    expect(badLoginResponse.status).toBe(401);
    expect((await badLoginResponse.json()).error.code).toBe("INVALID_CREDENTIALS");

    const loginResponse = await loginPost(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      }),
    );
    expect(loginResponse.status).toBe(200);
    const loginToken = loginResponse.headers.get("set-cookie")?.match(/crossval_session=([^;]+)/)?.[1];
    expect(loginToken).toBeTruthy();

    const logoutResponse = await logoutPost(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `crossval_session=${loginToken}`,
          origin: "http://localhost:3000",
        },
      }),
    );
    expect(logoutResponse.status).toBe(200);
    expect(
      (await meGet(
        new Request("http://localhost:3000/api/auth/me", {
          headers: { cookie: `crossval_session=${loginToken}` },
        }),
      )).status,
    ).toBe(401);

    const expiredUserId = new ObjectId();
    const expiredToken = "expired-physical-token";
    await collectionsFor(client, mongoDatabase).users.insertOne({
      _id: expiredUserId,
      email: "expired@example.com",
      emailNormalized: "expired@example.com",
      passwordHash: "not-used",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await collectionsFor(client, mongoDatabase).sessions.insertOne({
      _id: new ObjectId(),
      userId: expiredUserId,
      tokenHash: hashSessionToken(expiredToken),
      expiresAt: new Date(Date.now() - 1_000),
      createdAt: new Date(),
    });
    const expiredResponse = await meGet(
      new Request("http://localhost:3000/api/auth/me", {
        headers: { cookie: `crossval_session=${expiredToken}` },
      }),
    );
    expect(expiredResponse.status).toBe(401);
  });

  it("fails logout closed for missing, mismatched, and lookalike origins", async () => {
    for (const origin of [null, "https://evil.example", "http://localhost:3000.attacker.example"]) {
      const response = await logoutPost(
        new Request("http://localhost:3000/api/auth/logout", {
          method: "POST",
          headers: origin ? { origin } : undefined,
        }),
      );
      expect(response.status).toBe(403);
    }
  });

  it("fails signup and login closed for missing or mismatched origins", async () => {
    const requestBody = JSON.stringify({ email: "origin@example.com", password: "correct horse battery staple" });
    for (const origin of [null, "https://evil.example", "http://localhost:3000.attacker.example"]) {
      const headers: Record<string, string> = origin
        ? { "content-type": "application/json", origin }
        : { "content-type": "application/json" };
      const signupResponse = await signupPost(new Request("http://localhost:3000/api/auth/signup", {
        method: "POST",
        headers,
        body: requestBody,
      }));
      expect(signupResponse.status).toBe(403);

      const loginResponse = await loginPost(new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers,
        body: requestBody,
      }));
      expect(loginResponse.status).toBe(403);
    }
  });

  it("enforces order totals, tenant isolation, status filtering, and optimistic mutations", async () => {
    const aliceToken = await signupAndGetToken("orders-alice");
    const invalidOrderResponse = await createOrderPost(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ customer: "", dueDate: "2099-08-20", lines: [] }),
      }),
    );
    expect(invalidOrderResponse.status).toBe(400);
    expect((await invalidOrderResponse.json()).error.details).toMatchObject({
      customer: expect.any(String),
      lines: expect.any(String),
    });

    const missingOriginResponse = await createOrderPost(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          customer: "Rejected",
          dueDate: "2099-08-20",
          lines: [{ description: "Service", quantity: 1, unitPrice: "1.00" }],
        }),
      }),
    );
    expect(missingOriginResponse.status).toBe(403);

    const createResponse = await createOrderPost(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          customer: "Acme LLC",
          dueDate: "2099-08-20",
          lines: [
            { description: "Implementation", quantity: 2, unitPrice: "500.00" },
            { description: "Support", quantity: 1, unitPrice: "25.50" },
          ],
        }),
      }),
    );
    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("cache-control")).toBe("private, no-store");
    const created = await createResponse.json();
    expect(created.total).toBe("1025.50");
    expect(created.amountPaid).toBe("0.00");
    expect(created.amountDue).toBe("1025.50");
    expect(created.status).toBe("pending");
    expect(created.editable).toBe(true);
    expect(created.lines[0].lineTotal).toBe("1000.00");

    const orderId = created.id as string;
    const listResponse = await listOrdersGet(
      new Request("http://localhost:3000/api/orders?status=pending&page=1&limit=1", {
        headers: { cookie: `crossval_session=${aliceToken}` },
      }),
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.pagination).toMatchObject({ page: 1, limit: 1, total: 1 });
    expect(listBody.summary).toEqual({ outstanding: "1025.50", overdue: 0, partiallyPaid: 0, paid: 0 });

    const updateResponse = await patchOrderRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { cookie: `crossval_session=${aliceToken}`, origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ version: 1, customer: "Acme Updated" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).version).toBe(2);

    const staleUpdateResponse = await patchOrderRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { cookie: `crossval_session=${aliceToken}`, origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ version: 1, customer: "Stale Write" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(staleUpdateResponse.status).toBe(409);
    expect((await staleUpdateResponse.json()).error.code).toBe("ORDER_VERSION_CONFLICT");

    const derivedFieldResponse = await patchOrderRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { cookie: `crossval_session=${aliceToken}`, origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ version: 2, total: "1.00" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(derivedFieldResponse.status).toBe(400);

    const staleDeleteResponse = await deleteOrderRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}?version=1`, {
        method: "DELETE",
        headers: { cookie: `crossval_session=${aliceToken}`, origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(staleDeleteResponse.status).toBe(409);
    expect((await staleDeleteResponse.json()).error.code).toBe("ORDER_VERSION_CONFLICT");

    const bobToken = await signupAndGetToken("orders-bob");
    const crossTenantGet = await getOrderRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}`, {
        headers: { cookie: `crossval_session=${bobToken}` },
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(crossTenantGet.status).toBe(404);

    await client.db(mongoDatabase).collection("orders").updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { paymentCount: 1 } },
    );
    const lockedUpdateResponse = await patchOrderRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { cookie: `crossval_session=${aliceToken}`, origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ version: 2, customer: "Locked" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(lockedUpdateResponse.status).toBe(409);
    expect((await lockedUpdateResponse.json()).error.code).toBe("ORDER_LOCKED_AFTER_PAYMENT");
  });

  it("settles payments atomically with immutable replay and overpayment semantics", async () => {
    const aliceToken = await signupAndGetToken("payments-alice");
    const createResponse = await createOrderPost(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          customer: "Settlement Customer",
          dueDate: "2099-08-20",
          lines: [{ description: "Project", quantity: 1, unitPrice: "1000.00" }],
        }),
      }),
    );
    const orderId = (await createResponse.json()).id as string;
    const firstKey = "550e8400-e29b-41d4-a716-446655440001";
    const invalidPaymentResponse = await createPaymentPost(
      new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": "550e8400-e29b-41d4-a716-446655440000",
        },
        body: JSON.stringify({ amount: "", paymentDate: "" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(invalidPaymentResponse.status).toBe(400);
    expect((await invalidPaymentResponse.json()).error.details).toMatchObject({
      amount: expect.any(String),
    });

    const firstRequest = () =>
      new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": firstKey,
        },
        body: JSON.stringify({ amount: "400.00", paymentDate: "2026-08-10", note: "Bank transfer" }),
      });

    const firstResponse = await createPaymentPost(firstRequest(), { params: Promise.resolve({ orderId }) });
    expect(firstResponse.status).toBe(201);
    const firstBody = await firstResponse.json();
    expect(firstBody.payment).toMatchObject({
      sequence: 1,
      amount: "400.00",
      balanceBefore: "1000.00",
      balanceAfter: "600.00",
      paymentDate: "2026-08-10",
      note: "Bank transfer",
    });

    const replayResponse = await createPaymentPost(firstRequest(), { params: Promise.resolve({ orderId }) });
    expect(replayResponse.status).toBe(200);
    expect(replayResponse.headers.get("idempotency-replayed")).toBe("true");
    expect(await replayResponse.json()).toEqual(firstBody);

    const reusedResponse = await createPaymentPost(
      new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": firstKey,
        },
        body: JSON.stringify({ amount: "401.00", paymentDate: "2026-08-10", note: "Bank transfer" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(reusedResponse.status).toBe(409);
    expect((await reusedResponse.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const secondResponse = await createPaymentPost(
      new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": "550e8400-e29b-41d4-a716-446655440002",
        },
        body: JSON.stringify({ amount: "600.00", paymentDate: "2026-08-05" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(secondResponse.status).toBe(201);
    expect((await secondResponse.json()).payment).toMatchObject({
      sequence: 2,
      amount: "600.00",
      balanceBefore: "600.00",
      balanceAfter: "0.00",
    });

    const overpaymentResponse = await createPaymentPost(
      new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          cookie: `crossval_session=${aliceToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": "550e8400-e29b-41d4-a716-446655440003",
        },
        body: JSON.stringify({ amount: "1.00", paymentDate: "2026-08-11" }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(overpaymentResponse.status).toBe(409);
    expect((await overpaymentResponse.json()).error.details.maximumAllowed).toBe("0.00");

    const historyResponse = await getPaymentsRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
        headers: { cookie: `crossval_session=${aliceToken}` },
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(historyResponse.status).toBe(200);
    expect((await historyResponse.json()).items.map((payment: { sequence: number }) => payment.sequence)).toEqual([2, 1]);

    const bobToken = await signupAndGetToken("payments-bob");
    const crossTenantHistory = await getPaymentsRoute(
      new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
        headers: { cookie: `crossval_session=${bobToken}` },
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(crossTenantHistory.status).toBe(404);
  });

  it("proves distinct payment races preserve the persisted balance invariant", async () => {
    const token = await signupAndGetToken("race-distinct");
    const orderId = await createOrderForToken(token, "Distinct Race");
    const [first, second] = await Promise.all([
      submitPayment(token, orderId, "550e8400-e29b-41d4-a716-446655440010", "600.00"),
      submitPayment(token, orderId, "550e8400-e29b-41d4-a716-446655440011", "600.00"),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    await assertPersistedInvariants(orderId);
    const order = await collectionsFor(client, mongoDatabase).orders.findOne({ _id: new ObjectId(orderId) });
    expect(order?.amountDueCents).toBe(40_000n);
    expect(order?.paymentCount).toBe(1);
  });

  it("supports tenant-safe CSV export, immutable audit events, and idempotent refunds", async () => {
    const token = await signupAndGetToken("stretch-goals");
    const orderId = await createOrderForToken(token, "Stretch Customer");
    const payment = await submitPayment(token, orderId, "550e8400-e29b-41d4-a716-446655440060", "1000.00");
    expect(payment.status).toBe(201);

    const refundRequest = () => new Request(`http://localhost:3000/api/orders/${orderId}/refunds`, {
      method: "POST",
      headers: {
        cookie: `crossval_session=${token}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "idempotency-key": "550e8400-e29b-41d4-a716-446655440061",
      },
      body: JSON.stringify({ amount: "400.00", refundDate: "2026-08-12", note: "Customer credit" }),
    });
    const refundResponse = await createRefundPost(refundRequest(), { params: Promise.resolve({ orderId }) });
    expect(refundResponse.status).toBe(201);
    expect((await refundResponse.json()).refund).toMatchObject({ sequence: 1, amount: "400.00", balanceBefore: "0.00", balanceAfter: "400.00" });

    const refundReplay = await createRefundPost(refundRequest(), { params: Promise.resolve({ orderId }) });
    expect(refundReplay.status).toBe(200);
    expect(refundReplay.headers.get("idempotency-replayed")).toBe("true");

    const overrefund = await createRefundPost(new Request(`http://localhost:3000/api/orders/${orderId}/refunds`, {
      method: "POST",
      headers: {
        cookie: `crossval_session=${token}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "idempotency-key": "550e8400-e29b-41d4-a716-446655440062",
      },
      body: JSON.stringify({ amount: "700.00", refundDate: "2026-08-12" }),
    }), { params: Promise.resolve({ orderId }) });
    expect(overrefund.status).toBe(409);
    expect((await overrefund.json()).error.details.maximumAllowed).toBe("600.00");

    const refunds = await getRefundsRoute(new Request(`http://localhost:3000/api/orders/${orderId}/refunds`, { headers: { cookie: `crossval_session=${token}` } }), { params: Promise.resolve({ orderId }) });
    expect((await refunds.json()).items.map((item: { sequence: number }) => item.sequence)).toEqual([1]);

    const audit = await getAuditRoute(new Request(`http://localhost:3000/api/orders/${orderId}/audit`, { headers: { cookie: `crossval_session=${token}` } }), { params: Promise.resolve({ orderId }) });
    expect((await audit.json()).items.map((item: { action: string }) => item.action)).toEqual(["REFUND_RECORDED", "PAYMENT_RECORDED"]);

    const exportResponse = await exportOrdersRoute(new Request("http://localhost:3000/api/orders/export?from=2026-01-01&to=2026-12-31", { headers: { cookie: `crossval_session=${token}` } }));
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-type")).toContain("text/csv");
    expect(await exportResponse.text()).toContain("Stretch Customer");
    await assertPersistedInvariants(orderId);
  });

  it("collapses concurrent same-key same-payload requests to one payment", async () => {
    const token = await signupAndGetToken("race-same-key");
    const orderId = await createOrderForToken(token, "Same Key Race");
    const key = "550e8400-e29b-41d4-a716-446655440020";
    const [first, second] = await Promise.all([
      submitPayment(token, orderId, key, "400.00"),
      submitPayment(token, orderId, key, "400.00"),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    const bodies = await Promise.all([first.json(), second.json()]);
    expect(bodies[0].payment.id).toBe(bodies[1].payment.id);
    await assertPersistedInvariants(orderId);
  });

  it("rejects concurrent reuse of one key with a different payload", async () => {
    const token = await signupAndGetToken("race-reused-key");
    const orderId = await createOrderForToken(token, "Reused Key Race");
    const key = "550e8400-e29b-41d4-a716-446655440030";
    const [first, second] = await Promise.all([
      submitPayment(token, orderId, key, "100.00"),
      submitPayment(token, orderId, key, "200.00"),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const bodies = await Promise.all([first.json(), second.json()]);
    expect(bodies.some((body) => body.error?.code === "IDEMPOTENCY_KEY_REUSED")).toBe(true);
    await assertPersistedInvariants(orderId);
  });

  it("allows only valid serial outcomes for edit versus payment", async () => {
    const token = await signupAndGetToken("race-edit-payment");
    const orderId = await createOrderForToken(token, "Edit Payment Race");
    const [edit, payment] = await Promise.all([
      patchOrderRoute(
        new Request(`http://localhost:3000/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { cookie: `crossval_session=${token}`, origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ version: 1, customer: "Edited" }),
        }),
        { params: Promise.resolve({ orderId }) },
      ),
      submitPayment(token, orderId, "550e8400-e29b-41d4-a716-446655440040", "100.00"),
    ]);
    expect([200, 409]).toContain(edit.status);
    expect(payment.status).toBe(201);
    await assertPersistedInvariants(orderId);
  });

  it("prevents orphan payments in delete versus payment races", async () => {
    const token = await signupAndGetToken("race-delete-payment");
    const orderId = await createOrderForToken(token, "Delete Payment Race");
    const [deleted, payment] = await Promise.all([
      deleteOrderRoute(
        new Request(`http://localhost:3000/api/orders/${orderId}?version=1`, {
          method: "DELETE",
          headers: { cookie: `crossval_session=${token}`, origin: "http://localhost:3000" },
        }),
        { params: Promise.resolve({ orderId }) },
      ),
      submitPayment(token, orderId, "550e8400-e29b-41d4-a716-446655440050", "100.00"),
    ]);
    const deleteWon = deleted.status === 204 && payment.status === 404;
    const paymentWon = deleted.status === 409 && payment.status === 201;
    expect(deleteWon || paymentWon).toBe(true);
    await assertPersistedInvariants(orderId);
  });

  it("allows one winner for edit versus edit and stale delete versus edit", async () => {
    const token = await signupAndGetToken("race-edits");
    const orderId = await createOrderForToken(token, "Edit Race");
    const [firstEdit, secondEdit] = await Promise.all([
      patchOrderRoute(
        new Request(`http://localhost:3000/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { cookie: `crossval_session=${token}`, origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ version: 1, customer: "First" }),
        }),
        { params: Promise.resolve({ orderId }) },
      ),
      patchOrderRoute(
        new Request(`http://localhost:3000/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { cookie: `crossval_session=${token}`, origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ version: 1, customer: "Second" }),
        }),
        { params: Promise.resolve({ orderId }) },
      ),
    ]);
    expect([firstEdit.status, secondEdit.status].sort()).toEqual([200, 409]);

    const [staleDelete, newerEdit] = await Promise.all([
      deleteOrderRoute(
        new Request(`http://localhost:3000/api/orders/${orderId}?version=1`, {
          method: "DELETE",
          headers: { cookie: `crossval_session=${token}`, origin: "http://localhost:3000" },
        }),
        { params: Promise.resolve({ orderId }) },
      ),
      patchOrderRoute(
        new Request(`http://localhost:3000/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { cookie: `crossval_session=${token}`, origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({ version: 2, customer: "Newer" }),
        }),
        { params: Promise.resolve({ orderId }) },
      ),
    ]);
    expect([staleDelete.status, newerEdit.status].sort()).toEqual([200, 409]);
    await assertPersistedInvariants(orderId);
  });
});

function collectionsFor(currentClient: MongoClient, database: string) {
  return getCollections(currentClient.db(database));
}

let testUserCounter = 0;

async function signupAndGetToken(label: string): Promise<string> {
  const uniqueLabel = `${label}-${Date.now()}-${testUserCounter++}`;
  const response = await signupPost(
    new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: `${uniqueLabel}@example.com`,
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    }),
  );
  const token = response.headers.get("set-cookie")?.match(/crossval_session=([^;]+)/)?.[1];
  if (response.status !== 201 || !token) throw new Error("Test signup did not create a session.");
  return token;
}

async function createOrderForToken(token: string, customer: string): Promise<string> {
  const response = await createOrderPost(
    new Request("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        cookie: `crossval_session=${token}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        customer,
        dueDate: "2099-08-20",
        lines: [{ description: "Raceable service", quantity: 1, unitPrice: "1000.00" }],
      }),
    }),
  );
  if (response.status !== 201) throw new Error("Test order was not created.");
  return (await response.json()).id as string;
}

function submitPayment(
  token: string,
  orderId: string,
  idempotencyKey: string,
  amount: string,
): Promise<Response> {
  return createPaymentPost(
    new Request(`http://localhost:3000/api/orders/${orderId}/payments`, {
      method: "POST",
      headers: {
        cookie: `crossval_session=${token}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ amount, paymentDate: "2026-08-10" }),
    }),
    { params: Promise.resolve({ orderId }) },
  );
}

async function assertPersistedInvariants(orderId: string): Promise<void> {
  const collections = collectionsFor(client, mongoDatabase);
  const objectId = new ObjectId(orderId);
  const order = await collections.orders.findOne({ _id: objectId });
  const payments = await collections.payments.find({ orderId: objectId }).sort({ sequence: 1 }).toArray();
  const refunds = await collections.refunds.find({ orderId: objectId }).sort({ sequence: 1 }).toArray();

  if (!order) {
    expect(payments).toHaveLength(0);
    return;
  }

  const paymentSum = payments.reduce((sum, payment) => sum + payment.amountCents, 0n);
  const refundSum = refunds.reduce((sum, refund) => sum + refund.amountCents, 0n);
  expect(order.amountDueCents >= 0n && order.amountDueCents <= order.totalCents).toBe(true);
  expect(paymentSum - refundSum).toBe(order.totalCents - order.amountDueCents);
  expect(order.paymentCount).toBe(payments.length);
  expect(order.paymentCount).toBe(payments.length === 0 ? 0 : payments[payments.length - 1].sequence);
  expect(payments.map((payment) => payment.sequence)).toEqual(
    payments.map((_, index) => index + 1),
  );
  expect(order.refundCount ?? 0).toBe(refunds.length);
  expect(refunds.map((refund) => refund.sequence)).toEqual(
    refunds.map((_, index) => index + 1),
  );
}
