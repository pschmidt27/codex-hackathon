package com.codexhackathon.androidshare

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ShareApp(
    uiState: ShareUiState,
    onRetry: () -> Unit,
    onDone: () -> Unit,
) {
    MaterialTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            Scaffold { padding ->
                when (uiState) {
                    is ShareUiState.InvalidShare -> InvalidShareContent(
                        padding = padding,
                        message = uiState.message,
                        onDone = onDone,
                    )

                    is ShareUiState.PreviewAndSending -> ShareContent(
                        padding = padding,
                        headline = if (uiState.isSending) "Sending capture..." else "Ready to send",
                        supporting = if (uiState.isSending) null else "Captured text",
                        payload = uiState.payload,
                        primaryButtonLabel = null,
                        onPrimary = null,
                        showProgress = uiState.isSending,
                        onDone = onDone,
                    )

                    is ShareUiState.SendFailed -> ShareContent(
                        padding = padding,
                        headline = "Couldn't send capture",
                        supporting = uiState.message,
                        payload = uiState.payload,
                        primaryButtonLabel = "Retry",
                        onPrimary = onRetry,
                        showProgress = false,
                        onDone = onDone,
                    )

                    is ShareUiState.SendSucceeded -> ShareContent(
                        padding = padding,
                        headline = "Saved to server",
                        supporting = uiState.submissionId
                            ?.takeIf { it.isNotBlank() }
                            ?.let { "Submission $it" },
                        payload = uiState.payload,
                        primaryButtonLabel = "Done",
                        onPrimary = onDone,
                        showProgress = false,
                        onDone = onDone,
                    )
                }
            }
        }
    }
}

@Composable
private fun InvalidShareContent(
    padding: PaddingValues,
    message: String,
    onDone: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Button(onClick = onDone) {
            Text("Done")
        }
    }
}

@Composable
private fun ShareContent(
    padding: PaddingValues,
    headline: String,
    supporting: String?,
    payload: SharePayload,
    primaryButtonLabel: String?,
    onPrimary: (() -> Unit)?,
    showProgress: Boolean,
    onDone: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = headline,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
        )

        if (!supporting.isNullOrBlank()) {
            Text(
                text = supporting,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        PreviewCard(payload = payload, modifier = Modifier.weight(1f, fill = true))

        if (showProgress) {
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        if (primaryButtonLabel != null && onPrimary != null) {
            Button(
                onClick = onPrimary,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(primaryButtonLabel)
            }
        } else {
            Button(
                onClick = onDone,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Done")
            }
        }
    }
}

@Composable
private fun PreviewCard(
    payload: SharePayload,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Captured text",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f, fill = true)
                .background(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(20.dp),
                )
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = payload.text,
                style = MaterialTheme.typography.bodyLarge,
            )
            payload.sourceApp?.let {
                Text(
                    text = "Source: $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            payload.capturedAt?.let {
                Text(
                    text = "Captured: $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
