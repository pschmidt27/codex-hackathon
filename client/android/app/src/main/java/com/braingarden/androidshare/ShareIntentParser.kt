package com.braingarden.androidshare

import android.content.Intent
import android.net.Uri
import android.os.Build

object ShareIntentParser {
    private val supportedImageMimeTypes = setOf("image/jpeg", "image/png", "image/webp")

    fun parse(
        intent: Intent?,
        sourcePackage: String?,
    ): ParsedShareResult {
        val action = intent?.action
        val mimeType = intent?.type

        if (action == Intent.ACTION_SEND_MULTIPLE) {
            return ParsedShareResult.Rejected("Only one image can be shared at a time.")
        }

        if (action != Intent.ACTION_SEND || mimeType == null) {
            return ParsedShareResult.Rejected("Unsupported share. Send text or a single JPEG, PNG, or WebP image.")
        }

        if (mimeType == "text/plain") {
            val rawText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
            return if (rawText.isNullOrBlank()) {
                ParsedShareResult.Rejected("Shared text was empty.")
            } else {
                ParsedShareResult.Accepted(
                    IncomingShare.Text(
                        text = rawText,
                        sourceApp = sourcePackage,
                    ),
                )
            }
        }

        if (mimeType in supportedImageMimeTypes) {
            val imageUri = intent.parcelableExtra<Uri>(Intent.EXTRA_STREAM)
            return if (imageUri == null) {
                ParsedShareResult.Rejected("The shared image could not be opened.")
            } else {
                ParsedShareResult.Accepted(
                    IncomingShare.Image(
                        imageUri = imageUri,
                        mimeType = mimeType,
                        captionText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotBlank() },
                        sourceApp = sourcePackage,
                        displayName = imageUri.lastPathSegment?.substringAfterLast('/'),
                    ),
                )
            }
        }

        return ParsedShareResult.Rejected("Unsupported share. Send text or a single JPEG, PNG, or WebP image.")
    }

    @Suppress("DEPRECATION")
    private inline fun <reified T> Intent.parcelableExtra(name: String): T? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(name, T::class.java)
        } else {
            getParcelableExtra(name) as? T
        }
    }
}
