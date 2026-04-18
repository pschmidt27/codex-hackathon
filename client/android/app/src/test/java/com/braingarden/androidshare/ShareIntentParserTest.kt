package com.braingarden.androidshare

import android.content.Intent
import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ShareIntentParserTest {
    @Test
    fun parsesValidActionSendTextPayload() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "  hello world  ")
        }

        val parsed = ShareIntentParser.parse(
            intent = intent,
            sourcePackage = "com.example.notes",
        )

        assertTrue(parsed is ParsedShareResult.Accepted)
        val share = (parsed as ParsedShareResult.Accepted).share as IncomingShare.Text
        assertEquals("hello world", share.text)
        assertEquals("com.example.notes", share.sourceApp)
    }

    @Test
    fun parsesValidSingleImagePayload() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, Uri.parse("content://captures/item-1"))
            putExtra(Intent.EXTRA_TEXT, "status screenshot")
        }

        val parsed = ShareIntentParser.parse(intent, "com.example.gallery")

        assertTrue(parsed is ParsedShareResult.Accepted)
        val share = (parsed as ParsedShareResult.Accepted).share as IncomingShare.Image
        assertEquals("image/png", share.mimeType)
        assertEquals("status screenshot", share.captionText)
        assertEquals("com.example.gallery", share.sourceApp)
        assertEquals("content://captures/item-1", share.imageUri.toString())
    }

    @Test
    fun rejectsMissingText() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
        }

        val parsed = ShareIntentParser.parse(intent, "com.example")
        assertTrue(parsed is ParsedShareResult.Rejected)
        assertEquals("Shared text was empty.", (parsed as ParsedShareResult.Rejected).message)
    }

    @Test
    fun rejectsMultipleImages() {
        val parsed = ShareIntentParser.parse(
            Intent(Intent.ACTION_SEND_MULTIPLE).apply { type = "image/png" },
            "com.example",
        )

        assertTrue(parsed is ParsedShareResult.Rejected)
        assertEquals("Only one image can be shared at a time.", (parsed as ParsedShareResult.Rejected).message)
    }

    @Test
    fun rejectsUnsupportedType() {
        val parsed = ShareIntentParser.parse(
            Intent(Intent.ACTION_SEND).apply { type = "image/gif" },
            "com.example",
        )

        assertTrue(parsed is ParsedShareResult.Rejected)
        assertEquals(
            "Unsupported share. Send text or a single JPEG, PNG, or WebP image.",
            (parsed as ParsedShareResult.Rejected).message,
        )
    }
}
