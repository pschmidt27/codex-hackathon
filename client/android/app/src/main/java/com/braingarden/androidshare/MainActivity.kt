package com.braingarden.androidshare

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

class MainActivity : ComponentActivity() {
    private val endpointSettingsStore by lazy {
        EndpointSettingsStore(
            context = applicationContext,
            defaultEndpoint = BuildConfig.API_BASE_URL,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            var currentEndpoint by remember { mutableStateOf(endpointSettingsStore.getEndpointUrl()) }
            var showSettings by remember { mutableStateOf(false) }

            AppHome(
                currentEndpoint = currentEndpoint,
                showSettings = showSettings,
                onOpenSettings = { showSettings = true },
                onDismissSettings = { showSettings = false },
                onSaveSettings = { endpoint ->
                    endpointSettingsStore.saveEndpointUrl(endpoint)
                    currentEndpoint = endpointSettingsStore.getEndpointUrl()
                    showSettings = false
                },
            )
        }
    }
}
