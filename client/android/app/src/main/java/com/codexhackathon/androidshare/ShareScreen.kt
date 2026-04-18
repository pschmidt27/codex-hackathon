package com.codexhackathon.androidshare

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ShareApp(
    uiState: ShareUiState,
    currentEndpoint: String,
    onSubmit: () -> Unit,
    onRetry: () -> Unit,
    onDone: () -> Unit,
    onOpenApp: () -> Unit,
    onOpenSettings: () -> Unit,
    onDismissSettings: () -> Unit,
    onSaveSettings: (String) -> Unit,
    showSettings: Boolean,
) {
    MaterialTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            Scaffold { padding ->
                when (uiState) {
                    is ShareUiState.InvalidShare -> InvalidShareContent(
                        padding = padding,
                        message = uiState.message,
                        currentEndpoint = currentEndpoint,
                        onOpenApp = onOpenApp,
                        onOpenSettings = onOpenSettings,
                        onDone = onDone,
                    )

                    is ShareUiState.PreviewAndSending -> ShareContent(
                        padding = padding,
                        headline = if (uiState.isSending) "Sending capture..." else "Ready to send",
                        supporting = if (uiState.isSending) null else "Captured text",
                        payload = uiState.payload,
                        primaryButtonLabel = if (uiState.isSending) null else "Send",
                        onPrimary = if (uiState.isSending) null else onSubmit,
                        showProgress = uiState.isSending,
                        currentEndpoint = currentEndpoint,
                        showOpenApp = false,
                        onOpenApp = onOpenApp,
                        onOpenSettings = onOpenSettings,
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
                        currentEndpoint = currentEndpoint,
                        showOpenApp = true,
                        onOpenApp = onOpenApp,
                        onOpenSettings = onOpenSettings,
                        onDone = onDone,
                    )

                    is ShareUiState.SendSucceeded -> ShareContent(
                        padding = padding,
                        headline = "Saved to server",
                        supporting = uiState.submissionId
                            ?.takeIf { it.isNotBlank() }
                            ?.let { "Submission $it" },
                        payload = uiState.payload,
                        primaryButtonLabel = null,
                        onPrimary = null,
                        showProgress = false,
                        currentEndpoint = currentEndpoint,
                        showOpenApp = false,
                        onOpenApp = onOpenApp,
                        onOpenSettings = onOpenSettings,
                        onDone = onDone,
                        autoDismissOnSuccess = true,
                    )
                }

                if (showSettings) {
                    EndpointSettingsDialog(
                        initialValue = currentEndpoint,
                        onDismiss = onDismissSettings,
                        onSave = onSaveSettings,
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
    currentEndpoint: String,
    onOpenApp: () -> Unit,
    onOpenSettings: () -> Unit,
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
        Text(
            text = "Backend: $currentEndpoint",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            TextButton(onClick = onOpenApp) {
                Text("Open app")
            }
            TextButton(onClick = onOpenSettings) {
                Text("Settings")
            }
            Button(onClick = onDone) {
                Text("Done")
            }
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
    currentEndpoint: String,
    showOpenApp: Boolean,
    onOpenApp: () -> Unit,
    onOpenSettings: () -> Unit,
    onDone: () -> Unit,
    autoDismissOnSuccess: Boolean = false,
) {
    if (autoDismissOnSuccess) {
        LaunchedEffect(payload.submissionId) {
            onDone()
        }
    }

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

        Text(
            text = "Backend: $currentEndpoint",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        PreviewCard(payload = payload, modifier = Modifier.weight(1f, fill = true))

        if (showProgress) {
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (showOpenApp) {
                TextButton(
                    onClick = onOpenApp,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Open app")
                }
            } else {
                TextButton(
                    onClick = onOpenSettings,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Settings")
                }
            }

            if (primaryButtonLabel != null && onPrimary != null) {
                Button(
                    onClick = onPrimary,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(primaryButtonLabel)
                }
            } else {
                if (!autoDismissOnSuccess) {
                    Button(
                        onClick = onDone,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Done")
                    }
                }
            }

        }
    }
}

@Composable
fun AppHome(
    currentEndpoint: String,
    showSettings: Boolean,
    onOpenSettings: () -> Unit,
    onDismissSettings: () -> Unit,
    onSaveSettings: (String) -> Unit,
) {
    MaterialTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            Scaffold { padding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text(
                        text = "PKB Share",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Use Android Share to send text into this app. Configure the backend endpoint here.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = "Backend: $currentEndpoint",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Button(onClick = onOpenSettings) {
                        Text("Edit backend")
                    }
                }

                if (showSettings) {
                    EndpointSettingsDialog(
                        initialValue = currentEndpoint,
                        onDismiss = onDismissSettings,
                        onSave = onSaveSettings,
                    )
                }
            }
        }
    }
}

@Composable
private fun EndpointSettingsDialog(
    initialValue: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var endpointValue by remember(initialValue) { mutableStateOf(initialValue) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Backend endpoint")
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Set the backend base URL including host and port.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = endpointValue,
                    onValueChange = { endpointValue = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("URL") },
                    placeholder = { Text("http://10.0.2.2:8080/") },
                )
            }
        },
        confirmButton = {
            Button(onClick = { onSave(endpointValue) }) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
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
