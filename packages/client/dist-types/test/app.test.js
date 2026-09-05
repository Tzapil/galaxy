import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
describe("client", () => {
  it("exports the stage-one app component", () => {
    expect(App).toBeTypeOf("function");
  });
});
//# sourceMappingURL=app.test.js.map
