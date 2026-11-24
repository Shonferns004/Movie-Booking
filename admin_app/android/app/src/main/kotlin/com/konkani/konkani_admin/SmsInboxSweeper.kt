package com.konkani.konkani_admin

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import java.util.UUID
import kotlin.math.abs

/**
 * Backfills the observer from the SMS inbox.
 *
 * SMS_RECEIVED broadcasts are best-effort: an OEM may suppress them while the app
 * is force-stopped, the phone may have been rebooted, or the operator may have
 * granted SMS access only after the credit arrived. The old gateway app behaved
 * like a continuously running service; sweeping the inbox gives the merged admin
 * app the same "the credit is always picked up" behaviour.
 *
 * Only recent incoming messages that the bank parser recognises as credits are
 * added, so personal or promotional SMS are never queued.
 */
object SmsInboxSweeper {

    private const val LOOKBACK_MS = 30 * 60 * 1000L
    private const val DUPLICATE_WINDOW_MS = 10_000L

    @Synchronized
    fun sweep(context: Context): Int {
        if (context.checkSelfPermission(Manifest.permission.READ_SMS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return 0
        }

        val store = ObserverStore(context)
        val config = store.config()
        if (!config.enabled || !config.isConfigured) return 0

        val since = System.currentTimeMillis() - LOOKBACK_MS
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
        )

        val cursor = runCatching {
            context.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                projection,
                "${Telephony.Sms.DATE} >= ?",
                arrayOf(since.toString()),
                "${Telephony.Sms.DATE} DESC",
            )
        }.getOrNull() ?: return 0

        var queued = 0
        val known = store.events()
        val watched = config.senderFilter
            .split(',', ';', ' ')
            .map { it.trim().uppercase() }
            .filter { it.isNotEmpty() }

        try {
            val addressIndex = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
            val bodyIndex = cursor.getColumnIndex(Telephony.Sms.BODY)
            val dateIndex = cursor.getColumnIndex(Telephony.Sms.DATE)
            if (addressIndex < 0 || bodyIndex < 0 || dateIndex < 0) return 0

            while (cursor.moveToNext() && queued < MAX_PER_SWEEP) {
                val sender = cursor.getString(addressIndex)?.trim().orEmpty()
                    .ifBlank { "UNKNOWN" }
                val body = cursor.getString(bodyIndex)?.trim().orEmpty()
                val receivedAt = cursor.getLong(dateIndex)
                if (body.isEmpty()) continue

                if (watched.isNotEmpty() &&
                    watched.none { sender.uppercase().contains(it) }
                ) {
                    continue
                }

                // The broadcast path and the inbox path see the same PDU timestamp,
                // so an event this close is the same message.
                val duplicate = known.any {
                    it.sender == sender &&
                        it.body == body &&
                        abs(it.receivedAt - receivedAt) <= DUPLICATE_WINDOW_MS
                }
                if (duplicate) continue

                val parsed = BankSmsParser.parse(body) ?: continue

                store.appendEvent(
                    ObserverEvent(
                        id = UUID.randomUUID().toString(),
                        sender = sender,
                        body = body,
                        receivedAt = receivedAt,
                        status = STATUS_PENDING,
                        amount = parsed.amount,
                        amountPaise = parsed.amountPaise,
                        reference = parsed.reference,
                    ),
                )
                queued++
            }
        } finally {
            cursor.close()
        }

        if (queued > 0) {
            SmsIngestWorker.enqueue(context)
        }
        return queued
    }

    private const val MAX_PER_SWEEP = 20
}
