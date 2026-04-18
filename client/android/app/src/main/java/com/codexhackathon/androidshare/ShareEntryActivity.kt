package com.codexhackathon.androidshare

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState

class ShareEntryActivity : ComponentActivity() {
    private val viewModel: ShareViewModel by viewModels {
        ShareViewModel.factory(BuildConfig.API_BASE_URL)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        setContent {
            val uiState by viewModel.uiState.collectAsState()
            ShareApp(
                uiState = uiState,
                onRetry = viewModel::retry,
                onDone = ::finish,
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val payload = ShareIntentParser.parse(
            intent = intent,
            sourcePackage = resolveSourcePackage(intent),
        )
        viewModel.receiveShare(payload)
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
