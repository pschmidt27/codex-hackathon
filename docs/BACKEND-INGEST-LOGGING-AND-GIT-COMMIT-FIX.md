# Backend Ingest Logging And Git Commit Fix

## Summary
- Add request-start and request-finish logging for all incoming backend requests.
- Include `submissionId` in submission request logs.
- Stop rejecting a dirty configured vault repo during git preflight.
- Keep committing all current vault repo changes during ingest.
- Make git commit and push failures explicit in logs and async submission status.

## Implementation
- Update `backend/src/app.ts` to log request start before auth checks and log request finish with `requestId`, `method`, `path`, `statusCode`, and `durationMs`.
- Update `backend/src/routes/submissions.ts` to attach `submissionId` to request context and log when a submission is accepted.
- Update `backend/src/domain/git.ts` to remove the clean-working-tree preflight failure, preserve `git add --all .`, and wrap commit/push failures in structured `AppError`s with useful details.
- Keep `backend/src/domain/queue.ts` asynchronous and preserve job failure handling while surfacing clearer git failure messages.

## Verification
- Start the backend and confirm the startup log includes host and port.
- Send a submission and confirm request start and finish logs appear with `submissionId`.
- Confirm the configured vault repo receives an ingest commit even when already dirty.
- Confirm git failures appear in logs and in submission status/debug output.

## Assumptions
- Dirty vault state should not block ingest.
- The next ingest commit should include all current vault repo changes.
- Request metadata should be logged, but not request bodies or secrets.
- `POST /v1/submissions` remains asynchronous.
- Automated tests are intentionally skipped.
