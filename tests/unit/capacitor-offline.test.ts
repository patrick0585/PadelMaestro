import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const file = resolve(__dirname, "../../capacitor-web/offline.html");
const TARGET = "https://padelmaestro.de";

describe("capacitor-web/offline.html", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(file, "utf8");
    document.documentElement.innerHTML = source;
    document.documentElement.setAttribute(
      "lang",
      /<html[^>]*\slang="([^"]*)"/i.exec(source)?.[1] ?? "",
    );
  });

  it("hat die Überschrift 'Keine Verbindung'", () => {
    expect(document.querySelector("h1")?.textContent).toContain(
      "Keine Verbindung",
    );
  });

  it("hat genau einen Button 'Erneut versuchen'", () => {
    const buttons = document.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent?.trim()).toBe("Erneut versuchen");
  });

  it("setzt lang=de und viewport-fit=cover", () => {
    expect(source).toMatch(/<html[^>]*\slang="de"/i);
    expect(
      document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    ).toContain("viewport-fit=cover");
  });

  it("lädt per location.replace die Live-Seite", () => {
    const script = document.querySelector("script")?.textContent ?? "";
    expect(script).toContain(`location.replace("${TARGET}")`);
  });

  it("nutzt keine externen Ressourcen", () => {
    const withoutScript = source.replace(/<script[\s\S]*?<\/script>/gi, "");
    expect(withoutScript).not.toMatch(/\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
    expect(withoutScript).not.toMatch(/url\(\s*["']?https?:/i);
    expect(withoutScript).not.toMatch(/@import/i);
  });
});
