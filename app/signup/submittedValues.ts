/**
 * What a rejected signup form hands back to itself.
 *
 * THE BUG THIS EXISTS TO FIX: every error path returned `{status, field,
 * message}` and nothing else, so React re-rendered the form with empty inputs.
 * A player who ticked neither consent box — the single most likely mistake on
 * this form, since both are unticked by default and both are required — got
 * the right error message and an empty email, nickname, country and skill.
 * The same wipe hit `nickname taken`, `invalid country`, `email taken` and
 * `password too short`, which are the paths where the player has already got
 * everything else right.
 *
 * THE PASSWORD IS DELIBERATELY NOT HERE. Echoing it means the server sends a
 * plaintext password back down to the browser and React writes it into the
 * DOM as an attribute value, where it lands in the RSC payload and in any
 * error overlay. Re-typing one field is a smaller cost than that, and it is
 * the field a browser password manager refills for free. Every OTHER field
 * persists, which is the part that was actually expensive.
 *
 * Checkboxes carry their submitted state rather than being reset: the box the
 * player DID tick stays ticked, so the error names the one that is missing
 * instead of blaming both.
 */
export interface SubmittedValues {
  email: string;
  nickname: string;
  country: string;
  skill: string;
  phone: string;
  tos: boolean;
  gdpr: boolean;
  marketing: boolean;
}

/** A checkbox is present in the payload only when it was ticked. */
function ticked(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function submittedValues(formData: FormData): SubmittedValues {
  return {
    email: text(formData, "email"),
    nickname: text(formData, "nickname"),
    country: text(formData, "country"),
    skill: text(formData, "skill"),
    phone: text(formData, "phone"),
    tos: ticked(formData, "tos"),
    gdpr: ticked(formData, "gdpr"),
    marketing: ticked(formData, "marketing"),
  };
}
