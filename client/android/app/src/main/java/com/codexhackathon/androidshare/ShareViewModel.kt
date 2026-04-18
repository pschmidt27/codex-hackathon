package com.codexhackathon.androidshare

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import android.content.Context
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

class ShareViewModel(
    private val submissionGateway: SubmissionGateway,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
    private val submissionIdFactory: () -> String = { UUID.randomUUID().toString() },
    private val timestampFactory: () -> String = { Instant.now().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow<ShareUiState>(
        ShareUiState.InvalidShare("Unsupported share")
    )
    val uiState: StateFlow<ShareUiState> = _uiState.asStateFlow()

    private var latestPayload: SharePayload? = null
    private var latestIncomingShareKey: String? = null

    fun receiveShare(incomingShare: IncomingShare?) {
        if (incomingShare == null) {
            latestPayload = null
            latestIncomingShareKey = null
            _uiState.value = ShareUiState.InvalidShare("Unsupported share")
            return
        }

        if (
            incomingShare.dedupeKey == latestIncomingShareKey &&
            _uiState.value !is ShareUiState.SendFailed
        ) {
            return
        }

        val payload = SharePayload(
            submissionId = submissionIdFactory(),
            text = incomingShare.text,
            capturedAt = timestampFactory(),
            sourceApp = incomingShare.sourceApp,
        )
        latestPayload = payload
        latestIncomingShareKey = incomingShare.dedupeKey
        _uiState.value = ShareUiState.PreviewAndSending(payload, isSending = false)
    }

    fun submit() {
        val payload = latestPayload ?: return
        submit(payload)
    }

    fun retry() {
        submit()
    }

    private fun submit(payload: SharePayload) {
        val state = _uiState.value
        if (state is ShareUiState.PreviewAndSending && state.isSending) {
            return
        }

        _uiState.value = ShareUiState.PreviewAndSending(payload, isSending = true)
        viewModelScope.launch(mainDispatcher) {
            when (val result = submissionGateway.submitText(payload)) {
                is SubmissionResult.Success -> {
                    _uiState.value = ShareUiState.SendSucceeded(
                        payload,
                        result.response.submissionId,
                    )
                }

                is SubmissionResult.Failure -> {
                    _uiState.value = ShareUiState.SendFailed(
                        payload = payload,
                        message = result.message.ifBlank { "Couldn't send capture" },
                    )
                }
            }
        }
    }

    companion object {
        fun factory(
            context: Context,
            defaultApiBaseUrl: String,
        ): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    val endpointSettingsStore = EndpointSettingsStore(
                        context = context.applicationContext,
                        defaultEndpoint = defaultApiBaseUrl,
                    )
                    val repository = SubmissionRepository(
                        endpointProvider = endpointSettingsStore::getEndpointUrl,
                    )
                    @Suppress("UNCHECKED_CAST")
                    return ShareViewModel(repository) as T
                }
            }
    }
}
