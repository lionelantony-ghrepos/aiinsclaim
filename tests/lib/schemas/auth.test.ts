import { describe, expect, it } from "vitest";
import { loginFormSchema } from "@/lib/schemas/auth";

describe("loginFormSchema", () => {
  it("accepts valid credentials", () => {
    const parsed = loginFormSchema.safeParse({
      email: "adjuster@demo.local",
      password: "demo1234",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects missing password", () => {
    const parsed = loginFormSchema.safeParse({
      email: "adjuster@demo.local",
      password: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const parsed = loginFormSchema.safeParse({
      email: "not-an-email",
      password: "demo1234",
    });
    expect(parsed.success).toBe(false);
  });
});
