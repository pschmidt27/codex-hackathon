# Android Image Share Ingest Plan

## Goal

Extend the existing Android share flow and backend ingest pipeline so the system can accept a single shared image from Android, analyze it on the backend, persist both the raw asset and raw metadata in the vault, and create curated note work in `notes/`.

## Agreed scope

- Support a single shared image plus optional caption text
- Accept only `image/jpeg`, `image/png`, and `image/webp`
- Reject `ACTION_SEND_MULTIPLE`
- Reject unsupported formats such as GIF, HEIC/HEIF, and PDF
- Keep the current text submission flow working
- Use one backend submission per shared image

## Target behavior

1. A user shares a single image from an Android app.
2. The Android app receives the image and optional caption.
3. The Android app sends one `multipart/form-data` submission to the backend.
4. The backend saves the binary image under `raw/assets/`.
5. The backend creates a companion markdown file under `raw/`.
6. The backend runs a dedicated image-analysis step on the uploaded image.
7. The backend writes the analysis output into the raw markdown.
8. The backend runs the maintainer using the raw markdown as the source content.
9. The maintainer creates a new curated note or updates an existing one.
10. The backend updates `log.md`, commits the vault changes, and pushes them.

## Submission contract

### Text submissions

Keep the current JSON submission path for text intact.

### Image submissions

Add an image submission path using `multipart/form-data` with:

- `kind=image`
- `submissionId`
- `capturedAt`
- `sourceApp`
- optional `text`
- one binary file field named `image`

The backend should normalize both text and image requests into a shared internal submission model before queueing.

## Vault representation

For each image submission, persist:

- `raw/assets/<timestamp>--<submissionId>.<ext>`
- `raw/<timestamp>--<submissionId>.md`

The raw markdown should contain:

- submission ID
- captured timestamp
- source app
- optional caption text
- raw asset path
- MIME type
- file size
- image-analysis output

The raw markdown is the audit artifact and the maintainer input. The binary asset remains the canonical raw image.

## Curated note behavior

Every image submission must result in curated note work in `notes/`.

That work may be:

- `created`
- `updated`

The matching rule should be conservative:

- update an existing note only when the image clearly belongs to it
- otherwise create a new note

The maintainer result should expose:

- `curatedNotePath`
- `curatedAction`
- `filesChanged`
- `summary`

`log.md` should record:

- curated action
- curated note path
- raw metadata path
- raw asset path

## Backend changes

### 1. Request parsing

Update [backend/src/routes/submissions.ts](/Users/philipschmidt/Lemon/git/codex-hackathon/backend/src/routes/submissions.ts) to branch by content type:

- `application/json` for text
- `multipart/form-data` for images

### 2. Submission domain model

Update [backend/src/domain/submissions.ts](/Users/philipschmidt/Lemon/git/codex-hackathon/backend/src/domain/submissions.ts) and [backend/src/types/submissions.ts](/Users/philipschmidt/Lemon/git/codex-hackathon/backend/src/types/submissions.ts) to support typed submissions and image-specific validation.

Image validation should enforce:

- one file only
- allowed MIME types only
- optional caption text
- explicit binary size limits

### 3. Raw asset persistence

Extend [backend/src/domain/vault.ts](/Users/philipschmidt/Lemon/git/codex-hackathon/backend/src/domain/vault.ts) with helpers to:

- create `raw/assets/`
- derive image asset paths
- write binary files
- create companion raw markdown content and paths

### 4. Image-analysis stage

Add a dedicated backend image-analysis step before the maintainer runs.

Input:

- image file or image bytes
- optional caption
- submission metadata

Output written into the raw markdown:

- concise description
- OCR text
- detected entities or objects
- rough classification such as screenshot, photo, or document
- uncertainty markers when confidence is low

This step should be separate from the maintainer so perception and curation remain distinct concerns.

### 5. Queue orchestration

Update [backend/src/domain/queue.ts](/Users/philipschmidt/Lemon/git/codex-hackathon/backend/src/domain/queue.ts) so image submissions run this sequence:

1. persist raw image asset
2. create raw markdown
3. run image analysis
4. run maintainer
5. validate vault health
6. commit and push vault changes

Rollback behavior should remain intact if any step before commit fails.

### 6. Maintainer contract

Update [backend/src/domain/llm-maintainer.ts](/Users/philipschmidt/Lemon/git/codex-hackathon/backend/src/domain/llm-maintainer.ts) and the vault-maintenance rules so that image submissions:

- always result in curated note work
- may create a new note or update an existing note
- use a conservative merge rule

The maintainer should continue to curate from text, using the companion raw markdown as `rawSourceContent`.

## Android changes

### 1. Share registration

Update [client/android/app/src/main/AndroidManifest.xml](/Users/philipschmidt/Lemon/git/codex-hackathon/client/android/app/src/main/AndroidManifest.xml) to register supported image MIME types for the share entry activity.

### 2. Intent parsing

Extend [client/android/app/src/main/java/com/braingarden/androidshare/ShareIntentParser.kt](/Users/philipschmidt/Lemon/git/codex-hackathon/client/android/app/src/main/java/com/braingarden/androidshare/ShareIntentParser.kt) to:

- accept single-image `ACTION_SEND`
- extract a single content `Uri`
- extract optional caption text from `EXTRA_TEXT`
- reject `ACTION_SEND_MULTIPLE`
- reject unsupported MIME types

### 3. Client models and upload

Update the Android models, repository, and API layer in:

- [client/android/app/src/main/java/com/braingarden/androidshare/Models.kt](/Users/philipschmidt/Lemon/git/codex-hackathon/client/android/app/src/main/java/com/braingarden/androidshare/Models.kt)
- [client/android/app/src/main/java/com/braingarden/androidshare/SubmissionRepository.kt](/Users/philipschmidt/Lemon/git/codex-hackathon/client/android/app/src/main/java/com/braingarden/androidshare/SubmissionRepository.kt)
- [client/android/app/src/main/java/com/braingarden/androidshare/ApiService.kt](/Users/philipschmidt/Lemon/git/codex-hackathon/client/android/app/src/main/java/com/braingarden/androidshare/ApiService.kt)

The client should:

- preserve the current text path
- add multipart upload for image submissions
- include optional caption text when present

### 4. Share screen behavior

Update the share UI and view model so image shares:

- show a valid preview state
- use the same send, retry, and success flow as text where possible
- show clear unsupported-share errors for rejected formats and multi-image shares

## Suggested implementation order

1. Extend backend types and route parsing for typed text and image submissions
2. Add raw asset and raw markdown persistence helpers
3. Add the image-analysis stage and integrate it into queue processing
4. Update the maintainer result contract and prompt rules for mandatory curated note work
5. Extend the Android app to accept image shares and upload multipart payloads
6. Run end-to-end verification with real Android image shares

## Defaults to use unless changed later

- Reuse the existing `OPENAI_MODEL` configuration in V1
- Keep text submissions backward-compatible
- Add a dedicated image upload size limit instead of reusing the current text byte limit unchanged
