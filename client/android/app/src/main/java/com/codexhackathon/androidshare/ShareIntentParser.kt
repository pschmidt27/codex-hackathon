package com.codexhackathon.androidshare

import android.content.Intent

object ShareIntentParser {
    fun parse(
        intent: Intent?,
        sourcePackage: String?,
    ): IncomingShare? {
        val action = intent?.action
        val mimeType = intent?.type
        if (action != Intent.ACTION_SEND || mimeType != "text/plain") {
            return null
        }

        val rawText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
        if (rawText.isNullOrBlank()) {
            return null
        }

        return IncomingShare(
            text = rawText,
            sourceApp = sourcePackage,
        )
    }
}
