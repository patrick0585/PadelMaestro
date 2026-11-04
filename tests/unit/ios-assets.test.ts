import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import sharp from "sharp";

const assets = resolve(__dirname, "../../ios/App/App/Assets.xcassets");

describe("iOS-Assets", () => {
  it("App-Icon ist 1024x1024 ohne Alpha", async () => {
    const img = sharp(resolve(assets, "AppIcon.appiconset/AppIcon-512@2x.png"));
    const meta = await img.metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(meta.hasAlpha).toBe(false);
    const { data } = await img
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0x0b, 0x12, 0x20]);
  });

  it.each(["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"])(
    "%s ist 2732x2732, opak, Hintergrund #0b1220",
    async (name) => {
      const img = sharp(resolve(assets, "Splash.imageset", name));
      const meta = await img.metadata();
      expect(meta.width).toBe(2732);
      expect(meta.height).toBe(2732);
      expect(meta.hasAlpha).toBe(false);
      const { data } = await img
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([data[0], data[1], data[2]]).toEqual([0x0b, 0x12, 0x20]);
    },
  );
});
