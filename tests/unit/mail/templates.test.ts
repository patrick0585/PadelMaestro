import { describe, it, expect } from "vitest";
import {
  verifyEmailMail,
  passwordResetMail,
  emailChangedMail,
} from "@/lib/mail/templates";

const link = "https://padelmaestro.example/verify?token=abc_DEF-123";

function expectClean(html: string) {
  expect(html).not.toContain("<script");
  expect(html).not.toMatch(/<img/i);
}

describe("verifyEmailMail", () => {
  const m = verifyEmailMail({ name: "Anna", link });
  it("has fixed subject", () => {
    expect(m.subject).toBe("Bitte bestätige deine E-Mail-Adresse");
  });
  it("text contains name, link and validity", () => {
    expect(m.text).toContain("Hallo Anna,");
    expect(m.text).toContain(link);
    expect(m.text).toContain("24 Stunden");
    expect(m.text).toContain("Dein Padelmaestro");
  });
  it("html contains href and no script", () => {
    expect(m.html).toContain(`href="${link}"`);
    expectClean(m.html);
  });
});

describe("passwordResetMail", () => {
  const m = passwordResetMail({ name: "Anna", link });
  it("has fixed subject", () => {
    expect(m.subject).toBe("Passwort zurücksetzen");
  });
  it("text contains name, link and validity", () => {
    expect(m.text).toContain("Hallo Anna,");
    expect(m.text).toContain(link);
    expect(m.text).toContain("1 Stunde");
  });
  it("html contains href and no script", () => {
    expect(m.html).toContain(`href="${link}"`);
    expectClean(m.html);
  });
});

describe("emailChangedMail", () => {
  const m = emailChangedMail({ name: "Anna", newEmail: "neu@example.com" });
  it("has fixed subject", () => {
    expect(m.subject).toBe("Deine E-Mail-Adresse wurde geändert");
  });
  it("text contains name and new address", () => {
    expect(m.text).toContain("Hallo Anna,");
    expect(m.text).toContain("neu@example.com");
  });
  it("html contains address and no script", () => {
    expect(m.html).toContain("neu@example.com");
    expectClean(m.html);
  });
});

describe("escaping", () => {
  it("escapes name and newEmail in html but not in text", () => {
    const name = `<script>alert("x")</script>`;
    const v = verifyEmailMail({ name, link });
    expect(v.html).not.toContain("<script");
    expect(v.html).toContain("&lt;script&gt;");
    expect(v.text).toContain(name);
    const c = emailChangedMail({ name: "A", newEmail: `a"<b>@x.de` });
    expect(c.html).not.toContain("<b>");
  });
});
