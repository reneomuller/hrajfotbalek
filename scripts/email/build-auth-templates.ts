/**
 * Writes the three Supabase auth email templates (round 41) into
 * `docs/auth-email-templates/`, from the same layout and copy every other
 * email uses. The owner pastes them into Authentication → Emails; see
 * AUTH_EMAIL_TEMPLATE.md for where each one goes.
 *
 *   npm run email:auth-templates
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  AUTH_TEMPLATES,
  supabaseSubject,
  supabaseTemplate,
} from "../../lib/email/templates/authEmails";

const OUT = path.resolve(process.cwd(), "docs", "auth-email-templates");

for (const kind of AUTH_TEMPLATES) {
  writeFileSync(path.join(OUT, `${kind}.html`), `${supabaseTemplate(kind)}\n`);
  writeFileSync(path.join(OUT, `${kind}.subject.txt`), `${supabaseSubject(kind)}\n`);
  console.log(`wrote ${kind}.html and ${kind}.subject.txt`);
}
