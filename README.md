# Submission helper script

This repository includes `backend/scripts/perform-submission.ts`, a small Node.js script that submits a payload to the backend submission endpoint with `fetch`.

## What it does

The script sends a `POST` request to `/v1/submissions` with a JSON body shaped like this:

```json
{
  "submissionId": "uuid",
  "text": "My submission text",
  "sourceApp": "optional-source-app",
  "capturedAt": "2026-04-18T12:00:00.000Z"
}
```

If provided, it also sends the shared secret header:

```text
x-shared-secret: <value>
```

## Usage

Submit inline text:

```sh
cd backend
pnpm exec node backend/scripts/perform-submission.ts --text "My submission"
```

Submit text from a file:

```sh
cd backend
pnpm exec node backend/scripts/perform-submission.ts --file ./submission.txt
```

Submit to a custom endpoint:

```sh
cd backend
pnpm exec node backend/scripts/perform-submission.ts \
  --url http://127.0.0.1:3000/v1/submissions \
  --text "My submission"
```

Submit with an explicit shared secret:

```sh
cd backend
pnpm exec node backend/scripts/perform-submission.ts \
  --text "My submission" \
  --shared-secret "$AUTH_SHARED_SECRET"
```

## Options

- `--url <url>`: submission endpoint URL. Default: `http://127.0.0.1:3000/v1/submissions`
- `--text <text>`: submission text payload
- `--file <path>`: read submission text from a file
- `--submission-id <uuid>`: submission ID to send. Defaults to a generated UUID
- `--source-app <name>`: optional `sourceApp` value
- `--captured-at <iso>`: optional ISO-8601 timestamp
- `--shared-secret <value>`: optional `x-shared-secret` header value
- `--help`: print usage information

## Environment variables

The script also supports configuration through environment variables:

- `SUBMISSION_URL`
- `SUBMISSION_TEXT`
- `SUBMISSION_FILE`
- `SUBMISSION_ID`
- `SUBMISSION_SOURCE_APP`
- `SUBMISSION_CAPTURED_AT`
- `AUTH_SHARED_SECRET`

CLI flags take precedence over environment variables.

## Output

The script prints a formatted JSON object with the HTTP result:

```json
{
  "ok": true,
  "status": 202,
  "statusText": "Accepted",
  "body": {
    "status": "accepted",
    "submissionId": "..."
  }
}
```

If the server returns a non-2xx status, the script exits with a non-zero exit code.
