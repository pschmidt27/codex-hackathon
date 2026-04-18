package com.braingarden.androidshare

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

interface ApiService {
    suspend fun submitText(request: TextSubmissionRequest): SubmissionResult
}

class OkHttpApiService(
    private val baseUrl: String,
    private val client: OkHttpClient = defaultHttpClient(),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ApiService {
    override suspend fun submitText(request: TextSubmissionRequest): SubmissionResult =
        withContext(ioDispatcher) {
            val requestBody = JSONObject()
                .put("submissionId", request.submissionId)
                .put("text", request.text)
                .apply {
                    if (request.capturedAt != null) {
                        put("capturedAt", request.capturedAt)
                    }
                }
                .apply {
                    if (request.sourceApp != null) {
                        put("sourceApp", request.sourceApp)
                    }
                }
                .toString()
                .toRequestBody(JSON_MEDIA_TYPE)

            val httpRequest = Request.Builder()
                .url(baseUrl.trimEnd('/') + "/v1/submissions")
                .post(requestBody)
                .build()

            runCatching {
                client.newCall(httpRequest).execute().use { response ->
                    if (response.isSuccessful) {
                        val responseBody = response.body?.string().orEmpty()
                        val json = if (responseBody.isBlank()) JSONObject() else JSONObject(responseBody)
                        SubmissionResult.Success(
                            TextSubmissionResponse(
                                submissionId = json.optString("submissionId"),
                                status = json.optString("status", "accepted"),
                            ),
                        )
                    } else {
                        val message = response.body?.string()
                            ?.takeIf { it.isNotBlank() }
                            ?.let(::parseErrorMessage)
                            ?: "Couldn't send capture"
                        SubmissionResult.Failure(message)
                    }
                }
            }.getOrElse { error ->
                SubmissionResult.Failure(error.message ?: "Couldn't send capture")
            }
        }

    private fun parseErrorMessage(responseBody: String): String =
        runCatching { JSONObject(responseBody).optString("error") }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: "Couldn't send capture"

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        private fun defaultHttpClient(): OkHttpClient =
            OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .writeTimeout(10, TimeUnit.SECONDS)
                .build()
    }
}
