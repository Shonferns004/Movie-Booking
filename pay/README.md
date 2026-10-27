# Konkani SMS Gateway (observer app)

Android app that observes bank credit SMS and forwards them to the YouPI gateway so a
UPI checkout can be confirmed without manual verification.

The gateway URLs and credentials live in the Kotlin layer (`ObserverStore`), not in Dart.
The Flutter UI is only a mirror of that state.

## How it talks to the backend

| Mode | Endpoint | Auth |
| --- | --- | --- |
| Paired device (recommended) | `POST {base}/api/v1/observers/sms` | `X-Device-Id` + `X-Timestamp` + HMAC-SHA256 `X-Signature` |
| Observer token | `POST {base}/api/v1/pollers/events` | `Authorization: Bearer <observer token>` |
| Liveness | `POST {base}/api/v1/observers/heartbeat` | `X-Device-Id` |

`base` must be the payment gateway origin **including the `/youpi` prefix**, for example:

```
https://movie-api.onrender.com/youpi
```

Do not append `/api` and do not use the gateway's internal `:6100` port.

## Pairing a phone

1. Open `{base-without-/api}/admin` (for Render: `https://<service>.onrender.com/youpi/admin`)
   and enter the `ADMIN_API_TOKEN` when prompted.
2. **Services → Android SMS Companion App** → copy the **Enrollment Secret**.
3. In the app: **Settings → Gateway base URL** → paste `{base}` → **Pair device** → paste
   the enrollment secret.
4. Turn the observer on and grant **SMS** + **notification** permissions.
5. Set the app's battery usage to **Unrestricted** (Xiaomi/Oppo/Samsung especially) or
   Android will kill the receiver.
6. **Settings → Send test observation**. A `400 NO_ACTIVE_SESSION` is expected when no
   checkout is live: it proves the HMAC was accepted. `401`/`403` means pairing failed.
   Start a checkout to see an accepted observation.

## Build

```bash
flutter pub get
flutter build apk --release
```

The output is `build/app/outputs/flutter-apk/app-release.apk`.

### Release signing

`android/app/build.gradle.kts` reads `android/key.properties` when present and falls back
to the debug key otherwise. Create the keystore once:

```bash
keytool -genkey -v -keystore android/app/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then add `android/key.properties` (git-ignored):

```properties
storeFile=upload-keystore.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

Keep this keystore and its passwords: Android will refuse to update an installed app
signed with a different key.

### Default gateway URL

`ObserverStore.DEFAULT_BASE_URL` (in
`android/app/src/main/kotlin/com/konkani/konkani_sms_gateway/ObserverStore.kt`) is only
used on first launch. Set it to the hosted gateway origin before building so a fresh
install is pre-pointed at production. The value can still be changed in Settings.

## Privacy and compliance

The observer reads bank SMS and notifications on the device to verify UPI payments.
Before enabling it, the app shows a consent dialog. Operators should also:

- Publish a privacy policy and link it in Settings (the app opens
  `https://example.com/privacy-policy` by default — replace with your own URL).
- Keep raw observations only as long as needed; the gateway deletes observations
  older than 30 days automatically.
- Provide a way for staff to unpair and delete local data (Settings → Delete my data).
- Confirm with a lawyer that reading bank messages is permitted in your jurisdiction
  and under your bank/UPI provider's terms.
- Do not use this app to read messages on a device the user does not own without
  explicit, informed consent.

## Local development

The gateway normally runs as part of the API server (`cd ../server && npm run dev`) and
is reachable on the LAN at `http://<your-ip>:4000/youpi`. `usesCleartextTraffic` is
enabled for that, but production should always use HTTPS.
