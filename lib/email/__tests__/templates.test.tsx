import { describe, expect, it } from "vitest";
import {
  paymentConfirmedEmail,
  spotHeldEmail,
} from "@/lib/email/templates/bookingEmails";
import {
  expiryEmail,
  nudgeEmail,
  reminderEmail,
} from "@/lib/email/templates/lifecycleEmails";
import { waitlistSpotOpenEmail } from "@/lib/email/templates/waitlistEmail";
import {
  cancellationCreditEmail,
  gameCancelledEmail,
} from "@/lib/email/templates/cancellationEmails";
import { policy } from "@/lib/policy";
import { strings } from "@/lib/strings";

const STARTS_AT = "2026-07-25T16:00:00.000Z"; // 18:00 Europe/Prague
const HOSTILE = '<script>alert("xss")</script>';

const base = {
  nickname: "Player_1",
  venue: "Pražačka",
  startsAt: STARTS_AT,
  gameUrl: "https://hrajfotbal.com/game/abc",
};

const ics = {
  filename: "game.ics",
  content: "BEGIN:VCALENDAR",
  contentType: "text/calendar",
};

/** Every in-app template, rendered with a hostile venue for the escaping pass. */
const all = () => [
  {
    name: "spot-held",
    rendered: spotHeldEmail({
      ...base,
      venue: HOSTILE,
      amountDueCzk: 150,
      variableSymbol: 2600000042,
      spdString: "SPD*1.0*ACC:CZ123*AM:150.00",
      ics,
    }),
  },
  {
    name: "payment-confirmed",
    rendered: paymentConfirmedEmail({ ...base, venue: HOSTILE, ics }),
  },
  { name: "nudge", rendered: nudgeEmail({ ...base, venue: HOSTILE, amountDueCzk: 150 }) },
  { name: "expiry", rendered: expiryEmail({ ...base, venue: HOSTILE }) },
  { name: "reminder", rendered: reminderEmail({ ...base, venue: HOSTILE }) },
  {
    name: "waitlist-spot-open",
    rendered: waitlistSpotOpenEmail({
      ...base,
      venue: HOSTILE,
      convertUrl: "https://hrajfotbal.com/game/abc/waitlist/convert",
    }),
  },
  {
    name: "cancellation-credit",
    rendered: cancellationCreditEmail({
      ...base,
      venue: HOSTILE,
      creditCzk: 150,
      accountUrl: "https://hrajfotbal.com/account",
    }),
  },
  {
    name: "game-cancelled",
    rendered: gameCancelledEmail({
      ...base,
      venue: HOSTILE,
      creditCzk: 150,
      accountUrl: "https://hrajfotbal.com/account",
    }),
  },
];

describe("email templates", () => {
  it("renders all eight in-app templates with a subject and a body", () => {
    const rendered = all();
    expect(rendered).toHaveLength(8);
    for (const { name, rendered: email } of rendered) {
      expect(email.subject, name).toBeTruthy();
      expect(email.html, name).toContain("<!DOCTYPE html>");
      expect(email.text, name).toBeTruthy();
    }
  });

  it("escapes a hostile venue in every template body", () => {
    for (const { name, rendered } of all()) {
      expect(rendered.html, name).not.toContain("<script>");
      expect(rendered.html, name).toContain("&lt;script&gt;");
    }
  });

  it("escapes a hostile nickname too", () => {
    const rendered = spotHeldEmail({
      ...base,
      nickname: HOSTILE,
      amountDueCzk: 150,
      variableSymbol: 1,
      spdString: "SPD*1.0*",
    });
    expect(rendered.html).not.toContain("<script>");
  });

  it("renders times in Europe/Prague, never raw UTC", () => {
    const rendered = paymentConfirmedEmail(base);
    expect(rendered.text).toContain("18:00");
    expect(rendered.text).not.toContain("16:00");
  });

  it("spot-held carries the VS, the SPD string and the ics attachment", () => {
    const rendered = spotHeldEmail({
      ...base,
      amountDueCzk: 150,
      variableSymbol: 2600000042,
      spdString: "SPD*1.0*ACC:CZ123*AM:150.00",
      ics,
    });
    expect(rendered.text).toContain("2600000042");
    expect(rendered.text).toContain("SPD*1.0*ACC:CZ123*AM:150.00");
    expect(rendered.attachments?.[0].filename).toBe("game.ics");
  });

  it("payment-confirmed carries the ics attachment", () => {
    expect(paymentConfirmedEmail({ ...base, ics }).attachments).toHaveLength(1);
  });

  it("takes the nudge and reminder windows from policy, not literals", () => {
    expect(nudgeEmail({ ...base, amountDueCzk: 150 }).text).toContain(
      `${policy.expiry.graceHoursAfterNudge}h`,
    );
    expect(reminderEmail(base).text).toContain(
      `${policy.reminder.hoursBeforeStart}h`,
    );
    // The raw copy must still hold the placeholder, proving the number is not
    // baked into the string table.
    expect(strings.emails.nudge.body).toContain("{hours}");
    expect(strings.emails.reminder.body).toContain("{hours}");
  });

  it("says nothing about credit when a cancellation returned none", () => {
    const paid = cancellationCreditEmail({
      ...base,
      creditCzk: 150,
      accountUrl: "https://hrajfotbal.com/account",
    });
    const unpaid = cancellationCreditEmail({
      ...base,
      creditCzk: 0,
      accountUrl: "https://hrajfotbal.com/account",
    });
    expect(paid.text).toContain("150");
    expect(unpaid.text).not.toContain("0 CZK");
    expect(unpaid.text).toContain(strings.emails.cancellationCredit.noCreditBody);
  });

  it("has no magic-link template or copy — Supabase delivers that one", () => {
    const table = JSON.stringify(strings.emails).toLowerCase();
    expect(table).not.toContain("magic link");
    expect(table).not.toContain("magic_link");
    expect(table).not.toContain("sign in link");
  });
});
