import { describe, expect, it } from "vitest";
import { bookingConfirmedEmail, spotHeldEmail } from "@/lib/email/templates/bookingEmails";
import {
  cancellationCreditEmail,
  gameCancelledEmail,
} from "@/lib/email/templates/cancellationEmails";
import {
  creditsExpiringEmail,
  creditsPurchasedEmail,
} from "@/lib/email/templates/creditEmails";
import type { RenderedEmail } from "@/lib/email/templates/layout";
import { expiryEmail, nudgeEmail, reminderEmail } from "@/lib/email/templates/lifecycleEmails";
import type { EmailEnv, PaymentReceipt } from "@/lib/email/templates/parts";
import { waitlistSpotOpenEmail } from "@/lib/email/templates/waitlistEmail";
import { resolveStrings } from "@/lib/i18n/resolve";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { policy } from "@/lib/policy";

/**
 * ROUND 41 — the approved design on every email, in the reader's language.
 *
 * These render each template the way the dispatcher does and read what comes
 * out. They do not compare against a stored copy of the HTML: a snapshot would
 * pass a broken email the day somebody blessed it.
 */

const STARTS_AT = "2026-07-25T16:00:00.000Z"; // 18:00 Europe/Prague
const HOSTILE = '<script>alert("xss")</script>';
const BASE_URL = "https://www.hrajfotbal.com";

function env(locale: Locale = "en"): EmailEnv {
  return { locale, t: resolveStrings(locale), baseUrl: BASE_URL, cutoffHours: 12 };
}

const game = {
  venue: "Pražačka",
  startsAt: STARTS_AT,
  durationMinutes: 90,
  mapsUrl: "https://maps.app.goo.gl/abc",
  gameUrl: `${BASE_URL}/game/abc`,
};

const ics = { filename: "game.ics", content: "BEGIN:VCALENDAR", contentType: "text/calendar" };

const paid: PaymentReceipt = {
  orderId: "cs_live_a1b2c3d4e5f6g7h8",
  paidAt: "2026-07-20T12:03:00.000Z",
  credits: 1,
  amountCzk: 180,
  method: "card",
  validUntil: "2026-09-18T12:03:00.000Z",
  usedForGame: true,
  terms: { wording: "I agree to the Terms and Conditions.", acceptedAt: "2026-07-20T12:02:00.000Z" },
};

/** Every template, rendered for one language. */
function all(locale: Locale, venue = game.venue): { name: string; email: RenderedEmail }[] {
  const e = env(locale);
  const g = { ...game, venue };
  return [
    { name: "booking-confirmed", email: bookingConfirmedEmail({ ...g, places: 1, creditsPaid: 1, ics }, e) },
    {
      name: "booking-confirmed+receipt",
      email: bookingConfirmedEmail({ ...g, places: 3, creditsPaid: 3, ics, receipt: { ...paid, credits: 3, amountCzk: 540 } }, e),
    },
    { name: "guests-added", email: bookingConfirmedEmail({ ...g, kind: "guests", places: 3, creditsPaid: 2 }, e) },
    {
      name: "spot-held",
      email: spotHeldEmail({ ...g, amountDueCzk: 180, variableSymbol: 2600000042, spdString: "SPD*1.0*AM:180.00", ics }, e),
    },
    { name: "nudge", email: nudgeEmail({ ...g, amountDueCzk: 180 }, e) },
    { name: "expiry", email: expiryEmail(g, e) },
    { name: "reminder", email: reminderEmail({ ...g, places: 2 }, e) },
    { name: "waitlist", email: waitlistSpotOpenEmail({ ...g, convertUrl: `${BASE_URL}/game/abc/waitlist/convert` }, e) },
    { name: "cancel-credited", email: cancellationCreditEmail({ ...g, creditsReturned: 1, outcome: "credited" }, e) },
    { name: "cancel-late", email: cancellationCreditEmail({ ...g, creditsReturned: 0, outcome: "late" }, e) },
    { name: "cancel-unpaid", email: cancellationCreditEmail({ ...g, creditsReturned: 0, outcome: "unpaid" }, e) },
    { name: "game-cancelled", email: gameCancelledEmail({ ...g, creditsReturned: 2, reason: venue }, e) },
    { name: "credits-purchased", email: creditsPurchasedEmail({ paid: { ...paid, credits: 5, amountCzk: 810, usedForGame: false }, balanceCredits: 6 }, e) },
    { name: "credits-game-full", email: creditsPurchasedEmail({ paid: { ...paid, usedForGame: false }, gameFull: true }, e) },
    { name: "credits-expiring", email: creditsExpiringEmail({ credits: 2, expiresAt: "2026-09-18T12:03:00.000Z" }, e) },
  ];
}

describe("every email, in every language", () => {
  it.each(LOCALES)("leaves no {placeholder} and no **marker** unfilled in %s", (locale) => {
    // Act
    const emails = all(locale);

    // Assert
    for (const { name, email } of emails) {
      for (const part of [email.subject, email.html, email.text]) {
        expect(part, `${name}: an unfilled placeholder`).not.toMatch(/\{[a-zA-Z]+\}/);
        expect(part, `${name}: an unrendered **marker**`).not.toContain("**");
      }
    }
  });

  it.each(LOCALES)("speaks %s, not English, wherever a translation exists", (locale) => {
    // Arrange
    const english = all("en");

    // Act
    const translated = all(locale);

    // Assert
    if (locale === "en") return;
    for (const [i, { name, email }] of translated.entries()) {
      expect(email.subject, `${name}: the subject is still English`).not.toBe(english[i]!.email.subject);
    }
  });

  it("carries the brand, the badge and the reader's language on the document", () => {
    // Act
    const { email } = all("cs")[0]!;

    // Assert
    expect(email.html).toContain('<html lang="cs">');
    expect(email.html).toContain(`${BASE_URL}/brand/hf-logo-96.png`);
    expect(email.html).toContain("Hraj <span");
  });

  it("escapes a hostile venue everywhere it appears", () => {
    // Act
    const emails = all("en", HOSTILE);

    // Assert
    for (const { name, email } of emails) {
      expect(email.html, name).not.toContain("<script>");
    }
  });

  it("writes kick-off in Prague time, never raw UTC", () => {
    // Act
    const { email } = all("en")[0]!;

    // Assert
    expect(email.text).toContain("18:00");
    expect(email.text).toContain("18:00–19:30");
  });
});

describe("Credits never wear crowns", () => {
  it("shows crowns only on a receipt's price row and on a payment request", () => {
    // Arrange — the emails with no money moving at all.
    const moneyless = ["booking-confirmed", "guests-added", "reminder", "waitlist", "cancel-credited", "cancel-late", "cancel-unpaid", "game-cancelled", "credits-expiring", "expiry"];

    // Act
    const emails = all("en").filter(({ name }) => moneyless.includes(name));

    // Assert
    for (const { name, email } of emails) {
      expect(email.text, `${name} prices something in CZK`).not.toContain("CZK");
    }
  });

  it("counts a cancellation's refund in Credits", () => {
    // Act
    const email = cancellationCreditEmail({ ...game, creditsReturned: 2, outcome: "credited" }, env("en"));

    // Assert
    expect(email.text).toContain("2 Credits");
  });
});

describe("the booking confirmation — the approved template", () => {
  it("attaches the calendar invite and says so under the button", () => {
    // Act
    const email = bookingConfirmedEmail({ ...game, places: 1, creditsPaid: 1, ics }, env("en"));

    // Assert
    expect(email.attachments?.map((a) => a.filename)).toEqual(["game.ics"]);
    expect(email.text).toContain(resolveStrings("en").emails.common.calendarNote);
  });

  it("states the cancellation rule with the database's hours and the button's own label", () => {
    // Act
    const email = bookingConfirmedEmail({ ...game, places: 1, creditsPaid: 1 }, env("cs"));

    // Assert
    expect(email.text).toContain("12 hodin před výkopem");
    expect(email.text).toContain(`„${resolveStrings("cs").booking.cantMakeIt}“`);
  });

  it("adds the receipt, the terms box as ticked and the terms PDF when money moved", () => {
    // Act
    const email = bookingConfirmedEmail({ ...game, places: 1, creditsPaid: 1, ics, receipt: paid }, env("en"));

    // Assert
    expect(email.text).toContain("HF-E5F6G7H8");
    expect(email.text).toContain("180 CZK");
    expect(email.text).toContain(paid.terms!.wording);
    expect(email.attachments?.map((a) => a.filename)).toContain("Hraj-Fotbal-obchodni-podminky.pdf");
    const pdf = email.attachments?.find((a) => a.filename.endsWith(".pdf"));
    expect(pdf && "path" in pdf ? pdf.path : null).toBe(`${BASE_URL}/legal/obchodni-podminky.pdf`);
  });

  it("counts a party as places and guests", () => {
    // Act
    const email = bookingConfirmedEmail({ ...game, places: 3, creditsPaid: 3 }, env("en"));

    // Assert
    expect(email.text).toContain("You + 2 guests · 3 places");
  });

  it("links the venue to Maps", () => {
    // Act
    const email = bookingConfirmedEmail({ ...game, places: 1, creditsPaid: 1 }, env("en"));

    // Assert
    expect(email.html).toContain(`href="${game.mapsUrl}"`);
  });
});

describe("the payment request", () => {
  it("keeps the bank's Czech words in every language", () => {
    // Act
    const emails = LOCALES.map((locale) => all(locale).find((e) => e.name === "spot-held")!.email);

    // Assert
    for (const email of emails) {
      expect(email.text).toContain("Variabilní symbol: 2600000042");
      expect(email.text).toContain("QR platba (SPD)");
    }
  });
});

describe("windows come from policy, not from copy", () => {
  it("fills the nudge's grace from lib/policy.ts", () => {
    // Act
    const email = nudgeEmail({ ...game, amountDueCzk: 180 }, env("en"));

    // Assert
    expect(email.text).toContain(`${policy.expiry.graceHoursAfterNudge} hours`);
  });

  it("warns a week before Credits lapse, as Obchodní podmínky 5.4 says", () => {
    // Assert
    expect(policy.credits.expiryWarningDays).toBe(7);
  });

  it("adds the cancelled-game extension the terms promise", () => {
    // Act
    const email = gameCancelledEmail({ ...game, creditsReturned: 1 }, env("en"));

    // Assert
    expect(email.text).toContain(`extended by ${policy.credits.cancelledGameExtensionDays} days`);
  });
});

describe("a cancellation says why nothing came back", () => {
  it("blames the cutoff for a late one, not an unpaid booking", () => {
    // Act
    const late = cancellationCreditEmail({ ...game, creditsReturned: 0, outcome: "late" }, env("en"));
    const unpaid = cancellationCreditEmail({ ...game, creditsReturned: 0, outcome: "unpaid" }, env("en"));

    // Assert
    expect(late.text).toContain("less than 12 hours before kick-off");
    expect(late.text).not.toContain("Nothing had been paid");
    expect(unpaid.text).toContain("Nothing had been paid");
  });

  it("puts the organizer's reason under the headline, escaped", () => {
    // Act
    const email = gameCancelledEmail({ ...game, creditsReturned: 0, reason: `Pitch flooded ${HOSTILE}` }, env("en"));

    // Assert
    expect(email.text).toContain("“Pitch flooded");
    expect(email.html).not.toContain("<script>");
  });
});

describe("what the emails no longer carry", () => {
  it("has no magic-link template or copy — Supabase delivers that one", () => {
    // Act
    const table = JSON.stringify(resolveStrings("en").emails).toLowerCase();

    // Assert
    expect(table).not.toContain("magic");
  });

  it("drops the safety notice and the operator lines the owner removed site-wide", () => {
    // Act
    const texts = LOCALES.flatMap((locale) => all(locale).map(({ email }) => email.text));

    // Assert
    for (const text of texts) {
      expect(text).not.toMatch(/Playllu|coi\.gov\.cz|own risk|vlastní nebezpečí|Česká obchodní inspekce/);
    }
  });
});
