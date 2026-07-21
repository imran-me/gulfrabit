# Module · Auth

Login, register and forgot-password — clean centred card layout.

- Fragments: `_fragments/{login,register,forgot}.main.html`. One shared
  behaviour module `auth-page.js` (mode via `data-auth-mode`). Styles: `auth.css`.
- Real client-side validation (`utils/validate-form.js`): email, phone (BD),
  min-length, password match. Password show/hide toggle.
- **Mock auth only** against `data/users.json` + a localStorage session (shared
  `state.js`). Demo login: `demo@gulfrabit.com` / `demo1234`.

## Backend
`backend/endpoints.md` + `backend/api.js` — register/login/logout/refresh +
forgot/reset. Replace the mock with **JWT** auth; server hashes passwords
(bcrypt/argon2) — the plaintext passwords in `users.json` are a mock artefact only.
