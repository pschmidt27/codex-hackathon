# Android Share App Plan

## Summary

Implement a new Android capture-only app in `/client/android` using `Kotlin + Jetpack Compose`. The app should appear in the native Android Share sheet for `text/plain`, receive shared text via `Intent.ACTION_SEND`, show a minimal confirmation screen, and submit the payload to the backend with clear success and retryable error handling.

This is a hackathon slice, so the goal is a reliable end-to-end capture flow, not a polished app.

## Key Changes

### App foundation

- Create a new Android app project rooted in `/client/android`.
- Use a single share-entry activity plus a small Compose UI.
- Keep the internal structure minimal and explicit:
  - `ShareEntryActivity` handles share intents
  - `ShareViewModel` owns screen state and submission flow
  - `SubmissionRepository` performs network submission
  - `ApiService` defines the backend contract
- No local database, no background queue, no browsing UI, no authentication.

### Share flow behavior

- Register the app in the Android Share sheet for `ACTION_SEND` with MIME type `text/plain`.
- Accept only a single text payload from `Intent.EXTRA_TEXT`.
- Treat all input as opaque text, including URLs.
- Reject missing or blank shared text with a visible non-retryable error state.
- Show a lightweight screen with:
  - read-only preview of the shared text
  - sending state
  - success state
  - retryable error state
- Default to auto-send after the share screen opens.
- Prevent duplicate submissions while a request is in flight.
- Close the flow with a `Done` action after success.

### Provisional backend contract

- Plan Android against a concrete temporary API so backend and client can work in parallel.
- Use:

#### `POST /v1/submissions`

Accept a single shared text payload.

##### Request body

```json
{
  "submissionId": "2c8fba73-64cf-4f5c-8f69-8a79d5db7b6c",
  "text": "captured text from Android share flow",
  "capturedAt": "2026-04-18T12:00:00.000Z",
  "sourceApp": "com.example.app"
}
```

##### Field rules

- `submissionId`: required UUID from the client for idempotency
- `text`: required non-empty string
- `capturedAt`: optional ISO timestamp from device
- `sourceApp`: optional package/app identifier for debugging only

#### Response

Return `202 Accepted` after validation and enqueue.

```json
{
  "submissionId": "2c8fba73-64cf-4f5c-8f69-8a79d5db7b6c",
  "status": "accepted"
}
```

### UX constraints

- Keep copy minimal:
  - `Sending capture...`
  - `Saved to server`
  - `Couldn't send capture`
- If launched outside the share flow, show an unsupported-entry error.
- Do not add edit-before-send, offline retry queue, history, or settings in this version.

## Public Interfaces / Types

- Android manifest intent filter for:
  - exported share entry activity
  - `android.intent.action.SEND`
  - `android.intent.category.DEFAULT`
  - `text/plain`
- Request model:
  - `TextSubmissionRequest(submissionId: String, text: String, capturedAt: String?, sourceApp: String?)`
- Response model:
  - `TextSubmissionResponse(submissionId: String, status: String)`
- UI state model covering:
  - invalid share
  - preview/sending
  - send failed
  - send succeeded

## Test Plan

- Unit tests for share intent parsing:
  - valid `ACTION_SEND` with `EXTRA_TEXT`
  - missing text
  - blank text
  - unsupported action or MIME type
- View model tests:
  - auto-send on valid share
  - success transition
  - failure transition
  - retry flow
  - duplicate-submit prevention
- Repository/API tests with a fake HTTP server:
  - request body matches contract
  - `202 Accepted` handling
  - non-2xx handling
  - timeout/network failure handling
- Manual acceptance checks:
  - share text from at least three Android apps
  - verify text preview appears
  - verify successful submission reaches backend
  - verify failure preserves text and allows retry

## Assumptions

- `/client/android` is a greenfield Android app directory.
- `Kotlin + Jetpack Compose` is the default stack.
- The hackathon version is single-user and unauthenticated.
- The backend team can align on the provisional `/v1/submissions` contract.
- All shared input is plain text; attachments and multi-item share are out of scope.
