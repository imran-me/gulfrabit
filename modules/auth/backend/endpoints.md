# Auth · Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | create account → `{ user, token }` |
| POST | `/auth/login` | authenticate → `{ user, token }` (JWT) |
| POST | `/auth/logout` | invalidate refresh token |
| POST | `/auth/refresh` | rotate access token |
| POST | `/auth/forgot-password` | email a reset link |
| POST | `/auth/reset-password` | set a new password with a valid token |
| GET | `/auth/me` | current user from the bearer token |

Security (replaces the mock)
- Passwords hashed server-side (bcrypt/argon2). The plaintext in `users.json` is
  a front-end mock artefact — never ship it.
- JWT access token (short-lived) + refresh token (httpOnly cookie).
- Rate-limit login and forgot-password. Validate every field server-side.
- On login, merge the guest cart/wishlist (localStorage) into the account.
