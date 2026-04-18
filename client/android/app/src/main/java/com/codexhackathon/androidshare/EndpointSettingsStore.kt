package com.codexhackathon.androidshare

import android.content.Context

class EndpointSettingsStore(
    context: Context,
    private val defaultEndpoint: String,
) {
    private val sharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getEndpointUrl(): String {
        return sharedPreferences
            .getString(KEY_ENDPOINT_URL, defaultEndpoint)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: defaultEndpoint
    }

    fun saveEndpointUrl(value: String) {
        val normalizedValue = value.trim().ifEmpty { defaultEndpoint }
        sharedPreferences.edit().putString(KEY_ENDPOINT_URL, normalizedValue).apply()
    }

    companion object {
        private const val PREFS_NAME = "endpoint_settings"
        private const val KEY_ENDPOINT_URL = "backend_endpoint_url"
    }
}
