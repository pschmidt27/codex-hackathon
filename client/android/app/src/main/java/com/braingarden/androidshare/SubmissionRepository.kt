package com.braingarden.androidshare

import android.content.ContentResolver
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient

interface SubmissionGateway {
    suspend fun submit(payload: SharePayload): SubmissionResult
}

class SubmissionRepository(
    private val endpointProvider: () -> String,
    private val contentResolver: ContentResolver,
    private val client: OkHttpClient = OkHttpClient(),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : SubmissionGateway {
    override suspend fun submit(payload: SharePayload): SubmissionResult {
        val apiService = OkHttpApiService(
            baseUrl = endpointProvider(),
            client = client,
            ioDispatcher = ioDispatcher,
        )

        return when (payload) {
            is SharePayload.Text -> {
                apiService.submitText(
                    TextSubmissionRequest(
                        submissionId = payload.submissionId,
                        text = payload.text,
                        capturedAt = payload.capturedAt,
                        sourceApp = payload.sourceApp,
                    ),
                )
            }

            is SharePayload.Image -> {
                val imageBytes = withContext(ioDispatcher) {
                    contentResolver.openInputStream(payload.imageUri)?.use { it.readBytes() }
                }

                if (imageBytes == null || imageBytes.isEmpty()) {
                    return SubmissionResult.Failure("Couldn't read the shared image")
                }

                apiService.submitImage(
                    ImageSubmissionRequest(
                        submissionId = payload.submissionId,
                        imageBytes = imageBytes,
                        mimeType = payload.mimeType,
                        fileName = payload.displayName ?: defaultFileName(payload.mimeType),
                        text = payload.captionText,
                        capturedAt = payload.capturedAt,
                        sourceApp = payload.sourceApp,
                    ),
                )
            }
        }
    }

    private fun defaultFileName(mimeType: String): String =
        when (mimeType) {
            "image/jpeg" -> "share.jpg"
            "image/png" -> "share.png"
            "image/webp" -> "share.webp"
            else -> "share.bin"
        }
}
