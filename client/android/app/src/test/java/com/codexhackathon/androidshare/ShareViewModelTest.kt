package com.codexhackathon.androidshare

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareViewModelTest {
    @Test
    fun autoSendsOnValidShare() = runBlocking {
        val fakeGateway = FakeSubmissionGateway(
            SubmissionResult.Success(TextSubmissionResponse("abc123", "accepted"))
        )
        val viewModel = ShareViewModel(
            fakeGateway,
            Dispatchers.Unconfined,
            submissionIdFactory = { "abc123" },
            timestampFactory = { "2026-04-18T09:30:00Z" },
        )

        viewModel.receiveShare(validShare())

        val state = viewModel.uiState.value
        assertTrue(state is ShareUiState.SendSucceeded)
        assertEquals(1, fakeGateway.invocationCount)
        assertEquals("abc123", fakeGateway.submittedPayloads.single().submissionId)
    }

    @Test
    fun transitionsToFailureWhenSubmissionFails() = runBlocking {
        val fakeGateway = FakeSubmissionGateway(SubmissionResult.Failure("Couldn't send capture"))
        val viewModel = ShareViewModel(
            fakeGateway,
            Dispatchers.Unconfined,
            submissionIdFactory = { "failure-1" },
            timestampFactory = { "2026-04-18T09:30:00Z" },
        )

        viewModel.receiveShare(validShare())

        val state = viewModel.uiState.value
        assertTrue(state is ShareUiState.SendFailed)
    }

    @Test
    fun retriesAfterFailure() = runBlocking {
        val fakeGateway = FakeSubmissionGateway(
            SubmissionResult.Failure("Couldn't send capture"),
            SubmissionResult.Success(TextSubmissionResponse("retry-1", "accepted"))
        )
        val viewModel = ShareViewModel(
            fakeGateway,
            Dispatchers.Unconfined,
            submissionIdFactory = { "retry-1" },
            timestampFactory = { "2026-04-18T09:30:00Z" },
        )

        viewModel.receiveShare(validShare())
        viewModel.retry()

        val state = viewModel.uiState.value
        assertTrue(state is ShareUiState.SendSucceeded)
        assertEquals(2, fakeGateway.invocationCount)
    }

    @Test
    fun preventsDuplicateSubmissionForSamePayload() = runBlocking {
        val fakeGateway = FakeSubmissionGateway(
            SubmissionResult.Success(TextSubmissionResponse("abc123", "accepted"))
        )
        val viewModel = ShareViewModel(
            fakeGateway,
            Dispatchers.Unconfined,
            submissionIdFactory = { "abc123" },
            timestampFactory = { "2026-04-18T09:30:00Z" },
        )
        val share = validShare()

        viewModel.receiveShare(share)
        viewModel.receiveShare(share)

        assertEquals(1, fakeGateway.invocationCount)
    }

    private fun validShare() = IncomingShare(
        text = "hello",
        sourceApp = "com.example.notes",
    )

    private class FakeSubmissionGateway(
        private vararg val results: SubmissionResult,
    ) : SubmissionGateway {
        var invocationCount: Int = 0
            private set
        val submittedPayloads = mutableListOf<SharePayload>()

        override suspend fun submitText(payload: SharePayload): SubmissionResult {
            submittedPayloads += payload
            val result = results.getOrElse(invocationCount) { results.last() }
            invocationCount += 1
            return result
        }
    }
}
