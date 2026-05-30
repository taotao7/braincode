export type Token = {
  subject: string
  expiresAt: number
}

export type User = {
  id: string
}

export function validateToken(token: Token, loadUser: (subject: string) => User | undefined, now = Date.now()): User | undefined {
  const user = loadUser(token.subject)
  if (token.expiresAt <= now) return undefined
  return user
}
