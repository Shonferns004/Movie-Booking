package com.konkani.konkani_sms_gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import java.util.UUID

/**
 * Manifest-declared `SMS_RECEIVED` receiver.
 *
 * Android gives a broadcast receiver roughly ten seconds, so this only
 * classifies the message, records it, and hands delivery to WorkManager.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val store = ObserverStore(context)
        val config = store.config()
        if (!config.enabled) return

        val parts = runCatching {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        }.getOrNull() ?: return

        // Multi-part SMS arrive as several PDUs in a single broadcast: join the
        // bodies per originating address before parsing.
        val bodies = LinkedHashMap<String, StringBuilder>()
        val timestamps = LinkedHashMap<String, Long>()

        for (part in parts) {
            val body = part.messageBody ?: continue
            val sender = part.originatingAddress?.trim().orEmpty().ifBlank { "UNKNOWN" }
            bodies.getOrPut(sender) { StringBuilder() }.append(body)
            if (!timestamps.containsKey(sender)) {
                timestamps[sender] = part.timestampMillis
            }
        }

        val watched = parseWatchList(config.senderFilter)
        var queued = 0

        for ((sender, buffer) in bodies) {
            val text = buffer.toString().trim()
            if (text.isEmpty()) continue

            val isWatched = watched.isEmpty() || watched.any { sender.uppercase().contains(it) }
            if (!isWatched) continue

            val receivedAt = timestamps[sender] ?: System.currentTimeMillis()

            // Some OEMs deliver the same intent twice; keep the log honest.
            if (store.events().any { it.sender == sender && it.body == text && receivedAt - it.receivedAt < 5_000 }) {
                continue
            }

            val parsed = BankSmsParser.parse(text)
            val looksFinancial = FINANCIAL_HINT.containsMatchIn(text)

            if (parsed == null) {
                if (looksFinancial || watched.isNotEmpty()) {
                    store.appendEvent(
                        ObserverEvent(
                            id = UUID.randomUUID().toString(),
                            sender = sender,
                            body = text,
                            receivedAt = receivedAt,
                            status = STATUS_IGNORED,
                            message = "No credit amount found in this message",
                        ),
                    )
                }
                continue
            }

            store.appendEvent(
                ObserverEvent(
                    id = UUID.randomUUID().toString(),
                    sender = sender,
                    body = text,
                    receivedAt = receivedAt,
                    status = STATUS_PENDING,
                    amount = parsed.amount,
                    amountPaise = parsed.amountPaise,
                    reference = parsed.reference,
                ),
            )
            queued++
        }

        if (queued > 0) {
            SmsIngestWorker.enqueue(context)
        }
    }

    private fun parseWatchList(raw: String): List<String> =
        raw.split(',', ';', ' ')
            .map { it.trim().uppercase() }
            .filter { it.isNotEmpty() }

    companion object {
        private val FINANCIAL_HINT =
            Regex("""(?i)(rs\.?|inr|₹|credited|debited|upi)""")
    }
}
