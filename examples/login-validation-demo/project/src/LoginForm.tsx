import { type FormEvent, useState } from "react"
import { login, type LoginResult } from "./login"

type LoginFormProps = {
  authenticate?: (email: string, password: string) => string | undefined
}

function defaultAuthenticate(email: string, password: string): string | undefined {
  return email === "person@example.com" && password === "secret" ? "user-1" : undefined
}

export function LoginForm({ authenticate = defaultAuthenticate }: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [result, setResult] = useState<LoginResult | undefined>()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(login({ email, password }, authenticate))
  }

  return (
    <form aria-label="Login" onSubmit={handleSubmit}>
      <label>
        Email
        <input
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
      </label>
      <button type="submit">Sign in</button>
      {result?.ok ? <p>Signed in as {result.userId}</p> : null}
      {result && !result.ok ? <p role="alert">{result.error}</p> : null}
    </form>
  )
}
