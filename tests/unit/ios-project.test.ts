import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ios = resolve(__dirname, "../../ios/App");
const read = (p: string) => readFileSync(resolve(ios, p), "utf8");

describe("iOS-Projekt für TestFlight", () => {
  const pbxproj = read("App.xcodeproj/project.pbxproj");

  it("Entwicklungssprache ist Deutsch", () => {
    expect(pbxproj).toMatch(/developmentRegion = de;/);
    expect(pbxproj).toMatch(/knownRegions = \(\s*de,\s*Base,\s*\);/);
    expect(read("App/Info.plist")).toMatch(/<key>CFBundleDevelopmentRegion<\/key>\s*<string>de<\/string>/);
  });

  it("erklärt, dass keine eigene Verschlüsselung genutzt wird", () => {
    expect(read("App/Info.plist")).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  });

  it("liefert ein Datenschutz-Manifest ohne Tracking mit", () => {
    const manifest = read("App/PrivacyInfo.xcprivacy");
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    for (const type of ["EmailAddress", "Name", "UserID", "PhotosorVideos", "OtherUserContent"]) {
      expect(manifest).toContain(`NSPrivacyCollectedDataType${type}`);
    }
    expect(pbxproj).toMatch(/PrivacyInfo\.xcprivacy in Resources/);
  });
});
