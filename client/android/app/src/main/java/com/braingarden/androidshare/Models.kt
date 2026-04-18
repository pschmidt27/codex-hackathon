package com.braingarden.androidshare

import android.net.Uri

sealed interface IncomingShare {
    val sourceApp: String?
    val dedupeKey: String

    data class Text(
        val text: String,
        override val sourceApp: String?,
    ) : IncomingShare {
        override val dedupeKey: String = listOf("text", text, sourceApp.orEmpty()).joinToString("|")
    }

    data class Image(
        val imageUri: Uri,
        val mimeType: String,
        val captionText: String?,
        override val sourceApp: String?,
        val displayName: String?,
    ) : IncomingShare {
        override val dedupeKey: String = listOf(
            "image",
            imageUri.toString(),
            mimeType,
            captionText.orEmpty(),
            sourceApp.orEmpty(),
        ).joinToString("|")
    }
}

sealed interface ParsedShareResult {
    data class Accepted(val share: IncomingShare) : ParsedShareResult

    data class Rejected(val message: String) : ParsedShareResult
}

sealed interface SharePayload {
    val submissionId: String
    val capturedAt: String?
    val sourceApp: String?

    data class Text(
        override val submissionId: String,
        val text: String,
        override val capturedAt: String?,
        override val sourceApp: String?,
    ) : SharePayload

    data class Image(
        override val submissionId: String,
        val imageUri: Uri,
        val mimeType: String,
        val captionText: String?,
        val displayName: String?,
        override val capturedAt: String?,
        override val sourceApp: String?,
    ) : SharePayload
}

data class TextSubmissionRequest(
    val submissionId: String,
    val text: String,
    val capturedAt: String?,
    val sourceApp: String?,
)

data class ImageSubmissionRequest(
    val submissionId: String,
    val imageBytes: ByteArray,
    val mimeType: String,
    val fileName: String,
    val text: String?,
    val capturedAt: String?,
    val sourceApp: String?,
)

data class SubmissionResponse(
    val submissionId: String,
    val status: String,
)

sealed interface ShareUiState {
    data class InvalidShare(val message: String) : ShareUiState

    data class PreviewAndSending(
        val payload: SharePayload,
        val isSending: Boolean,
    ) : ShareUiState

    data class SendFailed(
        val payload: SharePayload,
        val message: String,
    ) : ShareUiState

    data class SendSucceeded(
        val payload: SharePayload,
        val submissionId: String?,
    ) : ShareUiState
}

sealed interface SubmissionResult {
    data class Success(val response: SubmissionResponse) : SubmissionResult

    data class Failure(val message: String) : SubmissionResult
}
