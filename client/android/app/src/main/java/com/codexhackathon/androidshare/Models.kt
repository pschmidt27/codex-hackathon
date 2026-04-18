package com.codexhackathon.androidshare

data class IncomingShare(
    val text: String,
    val sourceApp: String?,
) {
    val dedupeKey: String = listOf(text, sourceApp.orEmpty()).joinToString("|")
}

data class SharePayload(
    val submissionId: String,
    val text: String,
    val capturedAt: String?,
    val sourceApp: String?,
)

data class TextSubmissionRequest(
    val submissionId: String,
    val text: String,
    val capturedAt: String?,
    val sourceApp: String?,
)

data class TextSubmissionResponse(
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
    data class Success(val response: TextSubmissionResponse) : SubmissionResult

    data class Failure(val message: String) : SubmissionResult
}
