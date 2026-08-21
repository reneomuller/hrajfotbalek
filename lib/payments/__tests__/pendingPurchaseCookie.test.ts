import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * `next/headers` only exists inside a request, so the store is faked. What is
 * under test is not Next's cookie jar — it is the OPTIONS this code hands it,
 * and one of them is load-bearing in a way that fails silently.
 */
const store = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({ cookies: async () => store }));

const { rememberPendingPurchase, readPendingPurchase, forgetPendingPurchase } =
  await import("@/lib/payments/pendingPurchaseCookie");
const { PENDING_PURCHASE_COOKIE } = await import("@/lib/payments/pendingPurchase");

const UUID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";

beforeEach(() => {
  store.set.mockReset();
  store.get.mockReset();
  store.delete.mockReset();
});

describe("rememberPendingPurchase", () => {
  it("writes the kind and the id under the namespaced name", async () => {
    // Act
    await rememberPendingPurchase({ kind: "booking", id: UUID });

    // Assert
    const [name, value] = store.set.mock.calls[0]!;
    expect(name).toBe(PENDING_PURCHASE_COOKIE);
    expect(value).toBe(`booking:${UUID}`);
  });

  /*
   * THE ASSERTION THIS FILE EXISTS FOR.
   *
   * The return is a top-level navigation from `stripe.com` — cross-site. A
   * `strict` cookie is withheld on exactly that navigation, so tightening
   * this breaks nothing loudly: the page still renders, still finds the
   * purchase through the recovery lookup, and is simply wrong whenever the
   * player has two purchases in flight. That is the kind of regression a
   * security-minded edit makes on purpose, so it is pinned here with the
   * reason attached.
   */
  it("is lax, because strict is withheld on the return from Stripe", async () => {
    // Act
    await rememberPendingPurchase({ kind: "pass", id: UUID });

    // Assert
    expect(store.set.mock.calls[0]![2]).toMatchObject({ sameSite: "lax" });
  });

  it("is httpOnly and site-wide, and expires on its own", async () => {
    // Act
    await rememberPendingPurchase({ kind: "pass", id: UUID });

    // Assert
    const options = store.set.mock.calls[0]![2];
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe("/");
    expect(options.maxAge).toBeGreaterThan(0);
  });
});

describe("readPendingPurchase", () => {
  it("returns what was written", async () => {
    // Arrange
    store.get.mockReturnValue({ value: `pass:${UUID}` });

    // Act + Assert
    expect(await readPendingPurchase()).toEqual({ kind: "pass", id: UUID });
  });

  it("returns null when the cookie is absent", async () => {
    // Arrange
    store.get.mockReturnValue(undefined);

    // Act + Assert
    expect(await readPendingPurchase()).toBeNull();
  });

  it("returns null rather than passing junk on to a database lookup", async () => {
    // Arrange
    store.get.mockReturnValue({ value: "booking:'; drop table bookings; --" });

    // Act + Assert
    expect(await readPendingPurchase()).toBeNull();
  });
});

describe("forgetPendingPurchase", () => {
  it("deletes the stash by name", async () => {
    // Act
    await forgetPendingPurchase();

    // Assert
    expect(store.delete).toHaveBeenCalledWith(PENDING_PURCHASE_COOKIE);
  });
});
