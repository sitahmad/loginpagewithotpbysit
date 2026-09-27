# loginpagewithotpbysit

A static **login + OTP authentication demo** for web browsers. It is designed to run locally without paid providers or secrets.

## Run locally

Because this is a static site, you can run it by opening `index.html` directly, or by serving the folder:

```bash
cd /home/runner/work/loginpagewithotpbysit/loginpagewithotpbysit
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## How to use the demo

1. Choose OTP mode: **Email** or **Phone**.
2. Enter a valid identifier:
   - Email example: `demo@example.com`
   - Phone example: `+12025550123`
3. Click **Request OTP**.
4. Read the OTP from the on-screen **Demo mode panel**.
5. Enter the 6 digits and click **Verify OTP**.
6. On success, use **Logout and Reset** to start over.

## Demo OTP behavior

- OTP is generated **locally and deterministically** from the normalized identifier.
- No real SMS/email is sent.
- OTP is shown in the UI to keep testing transparent.
- OTP expires after a short timer.
- Resend is cooldown-limited.
- Verification attempts are limited.

## Features

- Responsive, accessible login/OTP flow
- Email or phone mode selection
- Validation with clear feedback and disabled/loading states
- Six-field OTP input with:
  - auto-advance
  - backspace navigation
  - arrow-key navigation
  - paste support
- Countdown timer + resend cooldown
- Attempt limit and restart/edit identifier flow
- Success state + logout/reset
- Optional remember-me using `localStorage`
- Theme toggle (light/dark)
- Small FAQ/help section
- Reduced-motion support

## Security and demo limitations

This project is **client-only demo code**, not production authentication.

- OTP generation and verification happen in browser JavaScript.
- Attackers can inspect/modify client code, so trust boundaries do not exist.
- Never treat this as real account security.

## Replacing demo OTP with a real backend/provider

For production:

1. Move OTP creation/verification to a backend API.
2. Store OTP hashes server-side with TTL and rate limits.
3. Use an email/SMS provider (e.g., Twilio, AWS SNS, SendGrid, etc.).
4. Do not return OTP to the client.
5. Add server-side abuse controls (IP/device throttling, lockouts, audit logs).
6. Use secure session/token management after successful verification.

## Notes on tests/checks

This repository currently has no automated test framework configured. Validation was performed via static inspection and runtime behavior checks for the JavaScript logic.
