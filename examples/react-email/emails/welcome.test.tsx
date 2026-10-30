import { render } from "@react-email/render";
import { expectEmailToPass } from "@emailens/cli/test";
import { test } from "vitest";
import Welcome from "./welcome";

test("the welcome email passes emailens", async () => {
  expectEmailToPass(await render(<Welcome name="Ada" />));
});
