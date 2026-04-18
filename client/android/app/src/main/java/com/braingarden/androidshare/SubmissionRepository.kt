package com.braingarden.androidshare

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import okhttp3.OkHttpClient

interface SubmissionGateway {
    suspend fun submitText(payload: SharePayload): SubmissionResult
}

class SubmissionRepository(
    private val endpointProvider: () -> String,
    private val client: OkHttpClient = OkHttpClient(),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : SubmissionGateway {
    override suspend fun submitText(payload: SharePayload): SubmissionResult {
        val request = TextSubmissionRequest(
            submissionId = payload.submissionId,
            text = payload.text,
            capturedAt = payload.capturedAt,
            sourceApp = payload.sourceApp,
        )
        return OkHttpApiService(
            baseUrl = endpointProvider(),
            client = client,
            ioDispatcher = ioDispatcher,
        ).submitText(request)
    }
}
