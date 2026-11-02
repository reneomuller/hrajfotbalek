import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizerAvatar } from "@/components/game/OrganizerAvatar";
import { strings } from "@/lib/strings";

/**
 * The organizer's face on the game page (2026-11-02, the owner: "it currently
 * doesn't show an image/profile pic. I'd like that to be visible").
 */
describe("OrganizerAvatar", () => {
  it("shows the linked player's photo", () => {
    // Arrange
    const photoUrl = "https://example.supabase.co/storage/v1/object/public/avatars/players/abc.webp?v=1";

    // Act
    const html = renderToStaticMarkup(<OrganizerAvatar name="Oliver" photoUrl={photoUrl} t={strings} />);

    // Assert
    expect(html).toContain('data-testid="organizer-avatar-photo"');
    expect(html).toContain("players%2Fabc.webp");
    expect(html).not.toContain(">O<");
  });

  it("falls back to initials for an organizer who is only a typed name", () => {
    const html = renderToStaticMarkup(<OrganizerAvatar name="Oliver" photoUrl={null} t={strings} />);

    expect(html).not.toContain("organizer-avatar-photo");
    expect(html).toContain(">O<");
  });
});
