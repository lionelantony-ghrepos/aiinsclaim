"use server";

import { redirect } from "next/navigation";
import { authenticateUser } from "@/lib/auth/credentials";
import { resolvePostLoginRedirect } from "@/lib/auth/route-access";
import { destroySession, establishSession } from "@/lib/auth/session";
import { loginFormSchema } from "@/lib/schemas/auth";

export type LoginActionState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials" };
  }

  const user = await authenticateUser(parsed.data.email, parsed.data.password);
  if (!user) {
    return { error: "Invalid email or password" };
  }

  await establishSession(user);

  const nextPath = formData.get("next");
  const destination = resolvePostLoginRedirect(
    user.role,
    typeof nextPath === "string" ? nextPath : null,
  );
  redirect(destination);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
