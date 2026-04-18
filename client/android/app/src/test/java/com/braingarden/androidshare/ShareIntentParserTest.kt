package com.braingarden.androidshare

import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ShareIntentParserTest {
    @Test
    fun parsesValidActionSendPayload() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "  hello world  ")
        }

        val parsed = ShareIntentParser.parse(
            intent = intent,
            sourcePackage = "com.example.notes",
        )

        requireNotNull(parsed)
        assertEquals("hello world", parsed.text)
        assertEquals("com.example.notes", parsed.sourceApp)
    }

    @Test
    fun rejectsMissingText() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
        }

        assertNull(ShareIntentParser.parse(intent, "com.example"))
    }

    @Test
    fun rejectsBlankText() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "   ")
        }

        assertNull(ShareIntentParser.parse(intent, "com.example"))
    }

    @Test
    fun rejectsUnsupportedActionOrType() {
        val wrongAction = Intent(Intent.ACTION_VIEW).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "hello")
        }
        val wrongType = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_TEXT, "hello")
        }

        assertNull(ShareIntentParser.parse(wrongAction, "com.example"))
        assertNull(ShareIntentParser.parse(wrongType, "com.example"))
    }
}
