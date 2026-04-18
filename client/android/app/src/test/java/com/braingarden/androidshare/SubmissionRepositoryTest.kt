package com.braingarden.androidshare

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SubmissionRepositoryTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun postsExpectedJsonContractAndAccepts202() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(202)
                .setBody("""{"submissionId":"submission-1","status":"accepted"}"""),
        )

        val apiService = OkHttpApiService(
            baseUrl = server.url("/").toString(),
            client = OkHttpClient(),
            ioDispatcher = Dispatchers.Unconfined,
        )

        val result = apiService.submitText(
            TextSubmissionRequest(
                submissionId = "submission-1",
                text = "hello world",
                capturedAt = "2026-04-18T09:30:00Z",
                sourceApp = "com.example.notes",
            ),
        )

        val recordedRequest = requireNotNull(server.takeRequest())
        assertEquals("/v1/submissions", recordedRequest.path)
        val json = JSONObject(recordedRequest.body.readUtf8())
        assertEquals("submission-1", json.getString("submissionId"))
        assertEquals("hello world", json.getString("text"))
        assertEquals("com.example.notes", json.getString("sourceApp"))
        assertEquals("2026-04-18T09:30:00Z", json.getString("capturedAt"))
        assertTrue(result is SubmissionResult.Success)
    }

    @Test
    fun postsExpectedMultipartContractForImages() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(202)
                .setBody("""{"submissionId":"submission-2","status":"accepted"}"""),
        )

        val apiService = OkHttpApiService(
            baseUrl = server.url("/").toString(),
            client = OkHttpClient(),
            ioDispatcher = Dispatchers.Unconfined,
        )

        val result = apiService.submitImage(
            ImageSubmissionRequest(
                submissionId = "submission-2",
                imageBytes = "image-bytes".toByteArray(),
                mimeType = "image/png",
                fileName = "capture.png",
                text = "caption",
                capturedAt = "2026-04-18T09:30:00Z",
                sourceApp = "com.example.gallery",
            ),
        )

        val recordedRequest = requireNotNull(server.takeRequest())
        assertEquals("/v1/submissions", recordedRequest.path)
        assertTrue(recordedRequest.getHeader("Content-Type").orEmpty().startsWith("multipart/form-data"))
        val body = recordedRequest.body.readUtf8()
        assertTrue(body.contains("name=\"kind\""))
        assertTrue(body.contains("\r\nimage\r\n"))
        assertTrue(body.contains("name=\"submissionId\""))
        assertTrue(body.contains("\r\nsubmission-2\r\n"))
        assertTrue(body.contains("name=\"text\""))
        assertTrue(body.contains("\r\ncaption\r\n"))
        assertTrue(body.contains("name=\"image\"; filename=\"capture.png\""))
        assertTrue(body.contains("Content-Type: image/png"))
        assertTrue(body.contains("image-bytes"))
        assertTrue(result is SubmissionResult.Success)
    }

    @Test
    fun returnsFailureForNon2xxResponses() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setBody("""{"error":"backend failed"}"""),
        )

        val apiService = OkHttpApiService(
            baseUrl = server.url("/").toString(),
            client = OkHttpClient(),
            ioDispatcher = Dispatchers.Unconfined,
        )

        val result = apiService.submitText(
            TextSubmissionRequest(
                submissionId = "broken-1",
                text = "broken",
                capturedAt = "2026-04-18T09:30:00Z",
                sourceApp = null,
            ),
        )

        assertTrue(result is SubmissionResult.Failure)
        assertEquals("backend failed", (result as SubmissionResult.Failure).message)
    }

    @Test
    fun returnsFailureForNetworkErrors() = runBlocking {
        val apiService = OkHttpApiService(
            baseUrl = "http://127.0.0.1:1",
            client = OkHttpClient(),
            ioDispatcher = Dispatchers.Unconfined,
        )

        val result = apiService.submitText(
            TextSubmissionRequest(
                submissionId = "offline-1",
                text = "offline",
                capturedAt = "2026-04-18T09:30:00Z",
                sourceApp = null,
            ),
        )

        assertTrue(result is SubmissionResult.Failure)
    }
}
