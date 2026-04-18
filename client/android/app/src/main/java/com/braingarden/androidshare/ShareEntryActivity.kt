package com.braingarden.androidshare

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

class ShareEntryActivity : ComponentActivity() {
    private val endpointSettingsStore by lazy {
        EndpointSettingsStore(
            context = applicationContext,
            defaultEndpoint = BuildConfig.API_BASE_URL,
        )
    }

    private val viewModel: ShareViewModel by viewModels {
        ShareViewModel.factory(
            context = applicationContext,
            defaultApiBaseUrl = BuildConfig.API_BASE_URL,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        setContent {
            val uiState by viewModel.uiState.collectAsState()
            var showSettings by remember { mutableStateOf(false) }
            ShareApp(
                uiState = uiState,
                currentEndpoint = endpointSettingsStore.getEndpointUrl(),
                onSubmit = viewModel::submit,
                onRetry = viewModel::retry,
                onDone = ::finish,
                onOpenApp = {
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                },
                onOpenSettings = { showSettings = true },
                onDismissSettings = { showSettings = false },
                onSaveSettings = { endpoint ->
                    endpointSettingsStore.saveEndpointUrl(endpoint)
                    showSettings = false
                },
                showSettings = showSettings,
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val parsedShare = ShareIntentParser.parse(
            intent = intent,
            sourcePackage = resolveSourcePackage(intent),
        )
        viewModel.receiveShare(parsedShare)
    }

    private fun resolveSourcePackage(intent: Intent?): String? {
        return callingPackage
            ?: referrer?.packageNameOrHost()
            ?: intent?.getStringExtra(Intent.EXTRA_REFERRER_NAME)
                ?.let(Uri::parse)
                ?.packageNameOrHost()
    }

    private fun Uri.packageNameOrHost(): String? {
        return host?.takeIf { it.isNotBlank() }
            ?: schemeSpecificPart?.takeIf { it.isNotBlank() }
    }
}
