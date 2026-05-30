export type LoginInput = {
  email: string
  password: string
}

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: string }

export function login(input: LoginInput, authenticate: (email: string, password: string) => string | undefined): LoginResult {
  const userId = authenticate(input.email, input.password)
  if (!userId) return { ok: false, error: "Invalid credentials." }
  return { ok: true, userId }
}
