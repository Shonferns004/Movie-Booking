package com.konkani.konkani_sms_gateway

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Observer configuration. Persisted by the Android layer so the broadcast
 * receiver, the WorkManager job and the Flutter UI all read the same values.
 */
data class ObserverConfig(
    val baseUrl: String = DEFAULT_BASE_URL,
    val observerToken: String = "",
    val receivingAccountId: String = "",
    val source: String = "SMS_GATEWAY",
    val senderFilter: String = "",
    val enabled: Boolean = false,
    val deviceId: String = "",
    val deviceSigningKey: String = "",
    val deviceMerchantId: String = "",
) {
    /** A phone enrolled from the admin panel's pairing QR / enrollment secret. */
    val isPaired: Boolean
        get() = deviceId.isNotBlank() && deviceSigningKey.isNotBlank()

    val isConfigured: Boolean
        get() = baseUrl.isNotBlank() && (observerToken.isNotBlank() || isPaired)

    companion object {
        const val DEFAULT_BASE_URL = "https://movie-booking-nvmq.onrender.com/youpi"
    }
}

/** One observed SMS and the state of its delivery to the gateway. */
data class ObserverEvent(
    val id: String,
    val sender: String,
    val body: String,
    val receivedAt: Long,
    val status: String,
    val amount: String? = null,
    val amountPaise: Long? = null,
    val reference: String? = null,
    val httpStatus: Int = 0,
    val message: String? = null,
    val attempts: Int = 0,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("sender", sender)
        put("body", body)
        put("receivedAt", receivedAt)
        put("status", status)
        amount?.let { put("amount", it) }
        amountPaise?.let { put("amountPaise", it) }
        reference?.let { put("reference", it) }
        put("httpStatus", httpStatus)
        message?.let { put("message", it) }
        put("attempts", attempts)
    }

    companion object {
        fun fromJson(json: JSONObject): ObserverEvent = ObserverEvent(
            id = json.optString("id", UUID.randomUUID().toString()),
            sender = json.optString("sender", "Unknown"),
            body = json.optString("body", ""),
            receivedAt = json.optLong("receivedAt", System.currentTimeMillis()),
            status = json.optString("status", STATUS_IGNORED),
            amount = json.optString("amount").takeIf { it.isNotBlank() },
            amountPaise = if (json.has("amountPaise")) json.optLong("amountPaise") else null,
            reference = json.optString("reference").takeIf { it.isNotBlank() },
            httpStatus = json.optInt("httpStatus", 0),
            message = json.optString("message").takeIf { it.isNotBlank() },
            attempts = json.optInt("attempts", 0),
        )
    }
}

const val STATUS_PENDING = "pending"
const val STATUS_SENT = "sent"
const val STATUS_FAILED = "failed"
const val STATUS_IGNORED = "ignored"

/**
 * Single source of truth for the observer: credentials, counters and the
 * capped activity log. All mutations are synchronised because the receiver,
 * the worker and the method channel can touch it from different threads.
 */
class ObserverStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun config(): ObserverConfig = ObserverConfig(
        baseUrl = prefs.getString(KEY_BASE_URL, ObserverConfig.DEFAULT_BASE_URL)
            ?: ObserverConfig.DEFAULT_BASE_URL,
        observerToken = prefs.getString(KEY_OBSERVER_TOKEN, "") ?: "",
        receivingAccountId = prefs.getString(KEY_ACCOUNT_ID, "") ?: "",
        source = prefs.getString(KEY_SOURCE, "SMS_GATEWAY") ?: "SMS_GATEWAY",
        senderFilter = prefs.getString(KEY_SENDER_FILTER, "") ?: "",
        enabled = prefs.getBoolean(KEY_ENABLED, false),
        deviceId = prefs.getString(KEY_DEVICE_ID, "") ?: "",
        deviceSigningKey = prefs.getString(KEY_DEVICE_SIGNING_KEY, "") ?: "",
        deviceMerchantId = prefs.getString(KEY_DEVICE_MERCHANT_ID, "") ?: "",
    )

    fun saveConfig(config: ObserverConfig) {
        prefs.edit()
            .putString(KEY_BASE_URL, normalizeUrl(config.baseUrl))
            .putString(KEY_OBSERVER_TOKEN, config.observerToken.trim())
            .putString(KEY_ACCOUNT_ID, config.receivingAccountId.trim())
            .putString(
                KEY_SOURCE,
                config.source.trim().ifBlank { "SMS_GATEWAY" }.uppercase(),
            )
            .putString(KEY_SENDER_FILTER, config.senderFilter.trim())
            .putBoolean(KEY_ENABLED, config.enabled)
            .putString(KEY_DEVICE_ID, config.deviceId.trim())
            .putString(KEY_DEVICE_SIGNING_KEY, config.deviceSigningKey.trim())
            .putString(KEY_DEVICE_MERCHANT_ID, config.deviceMerchantId.trim())
            .apply()
    }

    /** Persists the credentials returned by `/api/v1/pollers/android/pair`. */
    fun setPairedDevice(deviceId: String, signingKey: String, merchantId: String) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId.trim())
            .putString(KEY_DEVICE_SIGNING_KEY, signingKey.trim())
            .putString(KEY_DEVICE_MERCHANT_ID, merchantId.trim())
            .apply()
    }

    /** Drops the device credentials; the observer bearer token (if any) keeps working. */
    fun clearPairedDevice() {
        prefs.edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_DEVICE_SIGNING_KEY)
            .remove(KEY_DEVICE_MERCHANT_ID)
            .apply()
    }

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun setReceivingAccountId(id: String) {
        if (id.isBlank()) return
        prefs.edit().putString(KEY_ACCOUNT_ID, id.trim()).apply()
    }

    @Synchronized
    fun events(): List<ObserverEvent> {
        val raw = prefs.getString(KEY_EVENTS, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList(array.length()) {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    add(ObserverEvent.fromJson(item))
                }
            }
        }.getOrDefault(emptyList())
    }

    @Synchronized
    fun appendEvent(event: ObserverEvent) {
        val next = events().toMutableList()
        next.add(0, event)
        persist(trim(next))
    }

    @Synchronized
    fun updateEvent(event: ObserverEvent) {
        val next = events().toMutableList()
        val index = next.indexOfFirst { it.id == event.id }
        if (index >= 0) next[index] = event else next.add(0, event)
        persist(trim(next))
    }

    @Synchronized
    fun findEvent(id: String): ObserverEvent? = events().firstOrNull { it.id == id }

    /** Drops settled history but never a message that still needs delivery. */
    @Synchronized
    fun clearLog() {
        persist(events().filter { it.status == STATUS_PENDING })
    }

    @Synchronized
    fun stats(): Map<String, Int> {
        val list = events()
        return mapOf(
            "forwarded" to list.count { it.status == STATUS_SENT },
            "failed" to list.count { it.status == STATUS_FAILED },
            "pending" to list.count { it.status == STATUS_PENDING },
            "ignored" to list.count { it.status == STATUS_IGNORED },
        )
    }

    private fun persist(list: List<ObserverEvent>) {
        val array = JSONArray()
        list.forEach { array.put(it.toJson()) }
        prefs.edit().putString(KEY_EVENTS, array.toString()).apply()
    }

    private fun trim(list: List<ObserverEvent>): List<ObserverEvent> {
        if (list.size <= MAX_EVENTS) return list
        var overflow = list.size - MAX_EVENTS
        val kept = ArrayList<ObserverEvent>(MAX_EVENTS)
        for (event in list) {
            if (overflow > 0 && event.status != STATUS_PENDING) {
                overflow--
                continue
            }
            kept.add(event)
        }
        return kept
    }

    private fun normalizeUrl(raw: String): String {
        var value = raw.trim()
        while (value.endsWith("/")) value = value.dropLast(1)
        return value
    }

    companion object {
        private const val PREFS_NAME = "konkani_sms_gateway"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_OBSERVER_TOKEN = "observer_token"
        private const val KEY_ACCOUNT_ID = "receiving_account_id"
        private const val KEY_SOURCE = "source"
        private const val KEY_SENDER_FILTER = "sender_filter"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_EVENTS = "events"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_SIGNING_KEY = "device_signing_key"
        private const val KEY_DEVICE_MERCHANT_ID = "device_merchant_id"
        private const val MAX_EVENTS = 250
    }
}
