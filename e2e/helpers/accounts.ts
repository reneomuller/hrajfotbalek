import { expect, type Page } from "@playwright/test";
import { TERMS_VERSION } from "../../lib/legal.ts";
import { execAsOwner } from "./clock.ts";
import { anonClient, serviceClient } from "./session.ts";

/**
 * THROWAWAY ACCOUNTS (round 41's "tests for every action").
 *
 * Signing out, changing a password or an email, deleting an account — done to
 * a SEED player, any of them breaks that player's cached session for every
 * spec after it in the run. So each of those tests makes its own account, uses
 * it, and removes it whole: what it consented to, its bell, its events, its
 * row and its login.
 */

export interface Account {
  email: string;
  password: string;
  authId: string;
  /** Null for a login with no profile yet — the signup "finish" path. */
  playerId: string | null;
  nickname: string;
}

const PASSWORD = "correct-horse-battery";

function unique(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
}

export async function createAccount({
  profile = true,
  metadata = {},
}: { profile?: boolean; metadata?: Record<string, unknown> } = {}): Promise<Account> {
  const id = unique();
  const email = `act-${id}@example.com`;
  const nickname = `Act${id.slice(-7)}`;

  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);

  let playerId: string | null = null;
  if (profile) {
    // The real writer, as the player themself — not an insert behind its back.
    const client = anonClient();
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`);
    const written = await client.rpc("complete_signup_v2", {
      p_nickname: nickname,
      p_gdpr_consent: true,
      p_tos_accepted: true,
      p_tos_version: TERMS_VERSION,
      p_country: "CZ",
      p_skill_level: "intermediate",
      p_marketing_opt_in: false,
      p_phone: `+4207${id.slice(-8)}`,
    });
    if (written.error) throw new Error(`complete_signup_v2: ${written.error.message}`);
    const { data: row } = await admin.from("players").select("id").eq("auth_user_id", data.user.id).maybeSingle();
    playerId = (row as { id: string } | null)?.id ?? null;
  }

  return { email, password: PASSWORD, authId: data.user.id, playerId, nickname };
}

/** Removes an account whole — also one already anonymised by a deletion. */
export async function removeAccount(account: { authId: string; email?: string }): Promise<void> {
  const ids = `select id from public.players where auth_user_id = $1::uuid or ($2::text is not null and email = $2)`;
  const params = [account.authId, account.email ?? null];
  await execAsOwner(`delete from public.consent_records where player_id in (${ids})`, params);
  await execAsOwner(`delete from public.user_notification_reads where player_id in (${ids})`, params);
  await execAsOwner(`delete from public.credit_ledger where player_id in (${ids})`, params);
  await execAsOwner(`delete from public.events where player_id in (${ids})`, params);
  await execAsOwner(`delete from public.waitlist where player_id in (${ids})`, params);
  await execAsOwner(`delete from public.bookings where player_id in (${ids})`, params);
  await execAsOwner(`delete from public.players where id in (${ids})`, params);
  await execAsOwner("delete from auth.users where id = $1::uuid", [account.authId]);
}

/** A deleted account's row is anonymised and loses its login link; find it by id. */
export async function removePlayerRow(playerId: string): Promise<void> {
  for (const table of ["consent_records", "user_notification_reads", "credit_ledger", "events", "waitlist", "bookings"]) {
    await execAsOwner(`delete from public.${table} where player_id = $1::uuid`, [playerId]);
  }
  await execAsOwner("delete from public.players where id = $1::uuid", [playerId]);
}

/** Signs in through the real form, as a player would. */
export async function signInThroughForm(page: Page, account: Pick<Account, "email" | "password">): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(account.email);
  await page.getByTestId("login-password").fill(account.password);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
}
