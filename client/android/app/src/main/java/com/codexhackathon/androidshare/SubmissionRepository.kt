package com.codexhackathon.androidshare

interface SubmissionGateway {
    suspend fun submitText(payload: SharePayload): SubmissionResult
}

class SubmissionRepository(
    private val apiService: ApiService,
) : SubmissionGateway {
    override suspend fun submitText(payload: SharePayload): SubmissionResult {
        val request = TextSubmissionRequest(
            submissionId = payload.submissionId,
            text = payload.text,
            capturedAt = payload.capturedAt,
            sourceApp = payload.sourceApp,
        )
        return apiService.submitText(request)
    }
}
