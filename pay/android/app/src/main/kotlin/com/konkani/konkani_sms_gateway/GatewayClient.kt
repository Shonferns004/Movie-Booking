package com.konkani.konkani_sms_gateway

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * HTTP client for the embedded YouPI gateway.
 *
 * Two transports are supported:
 *
 *  1. Observer token (what the app used before pairing):
 *       POST {base}/api/v1/pollers/events
 *       GET  {base}/api/v1/pollers/active-window
 *     authenticated with `Authorization: Bearer <observer_api_token>`.
 *
 *  2. Paired device (the admin panel's "Android SMS Companion App" flow):
 *       POST {base}/api/v1/pollers/android/pair      (enrollment secret -> device key)
 *       POST {base}/api/v1/observers/sms             (HMAC-signed observation)
 *       POST {base}/api/v1/observers/heartbeat
 *
 * The pair endpoint returns `{ deviceId, signingKey, merchantId }`. Every
 * observation is signed as `HMAC-SHA256("<raw json body>:<timestamp millis>")`
 * with that key and sent in `X-Signature`, alongside `X-Device-Id` and
 * `X-Timestamp`. The gateway stores the key itself, so no bearer token is used
 * on this path and the device's merchant resolves the receiving account.
 */
object GatewayClient {

    private const val CONNECT_TIMEOUT_MS = 12_000
    private const val READ_TIMEOUT_MS = 20_000
    private const val DEFAULT_MERCHANT_ID = "00000000-0000-0000-0000-000000000001"

    enum class Kind { SENT, FAILED, RETRY }

    data class Outcome(
        val kind: Kind,
        val httpStatus: Int,
        val message: String,
    )

    data class Session(
        val receivingAccountId: String,
        val amount: String,
        val status: String,
    )

    data class ActiveWindow(
        val ok: Boolean,
        val httpStatus: Int,
        val message: String,
        val sessions: List<Session>,
    )

    /** Credentials created by the pairing exchange. */
    data class Device(
        val id: String,
        val signingKey: String,
    )

    data class PairResult(
        val ok: Boolean,
        val httpStatus: Int,
        val message: String,
        val deviceId: String = "",
        val signingKey: String = "",
        val merchantId: String = "",
    )

    /** Input extracted from the admin panel's enrollment secret or QR payload. */
    data class PairingInput(
        val token: String,
        val merchantId: String = DEFAULT_MERCHANT_ID,
        val version: String = "v1",
        val expiresAt: Long? = null,
    )

    fun parsePairingInput(raw: String): PairingInput? {
        val text = raw.trim()
        if (text.isEmpty()) return null

        if (!text.startsWith("{")) {
            // The panel displays the bare secret; strip whitespace pasted along with it.
            val token = text.filterNot { it.isWhitespace() }
            return if (token.isEmpty()) null else PairingInput(token = token)
        }

        val json = runCatching { JSONObject(text) }.getOrNull() ?: return null
        val token = json.optString("enrollmentToken")
            .ifBlank { json.optString("token") }
            .trim()
        if (token.isEmpty()) return null

        return PairingInput(
            token = token,
            merchantId = json.optString("merchantId").trim()
                .ifBlank { DEFAULT_MERCHANT_ID },
            version = json.optString("version").trim().ifBlank { "v1" },
            expiresAt = if (json.has("expiresAt")) json.optLong("expiresAt") else null,
        )
    }

    /**
     * Exchanges the enrollment secret for device credentials.
     *
     * The QR payload's `serverUrl` points at the gateway's internal loopback
     * port, so callers always pass the phone-reachable [baseUrl] instead.
     */
    fun pairDevice(
        baseUrl: String,
        input: PairingInput,
        deviceName: String,
        deviceModel: String,
    ): PairResult {
        val payload = JSONObject().apply {
            put("enrollmentToken", input.token)
            put("merchantId", input.merchantId)
            put("deviceName", deviceName)
            put("deviceModel", deviceModel)
            put("version", input.version)
            input.expiresAt?.let { put("expiresAt", it) }
        }

        return try {
            val response = request(
                url = endpoint(baseUrl, "/api/v1/pollers/android/pair"),
                method = "POST",
                body = payload.toString(),
            )
            val json = runCatching { JSONObject(response.body) }.getOrNull()

            if (response.code in 200..299 && json != null && json.optBoolean("paired")) {
                val deviceId = json.optString("deviceId").trim()
                val signingKey = json.optString("signingKey").trim()
                if (deviceId.isEmpty() || signingKey.isEmpty()) {
                    PairResult(false, response.code, "Gateway did not return device credentials")
                } else {
                    PairResult(
                        ok = true,
                        httpStatus = response.code,
                        message = "Paired",
                        deviceId = deviceId,
                        signingKey = signingKey,
                        merchantId = json.optString("merchantId").trim()
                            .ifBlank { input.merchantId },
                    )
                }
            } else {
                PairResult(false, response.code, reasonOf(json, response.code))
            }
        } catch (error: IOException) {
            PairResult(false, 0, error.message ?: "Network error while pairing")
        } catch (error: Exception) {
            PairResult(false, 0, error.message ?: "Could not reach the pairing endpoint")
        }
    }

    /** Best-effort liveness ping; the panel shows it as the device heartbeat. */
    fun heartbeat(baseUrl: String, deviceId: String) {
        if (deviceId.isBlank()) return
        try {
            request(
                url = endpoint(baseUrl, "/api/v1/observers/heartbeat"),
                method = "POST",
                body = JSONObject().put("deviceId", deviceId).toString(),
                extraHeaders = mapOf("X-Device-Id" to deviceId),
            )
        } catch (_: Exception) {
            // A missed heartbeat must never block ingest or the UI.
        }
    }

    fun sendObservation(
        baseUrl: String,
        observerToken: String,
        device: Device?,
        source: String,
        receivingAccountId: String,
        sender: String,
        rawText: String,
        observedAtMillis: Long,
        parsed: BankSmsParser.Parsed?,
    ): Outcome {
        return if (device != null) {
            sendDeviceObservation(
                baseUrl = baseUrl,
                device = device,
                receivingAccountId = receivingAccountId,
                sender = sender,
                rawText = rawText,
                observedAtMillis = observedAtMillis,
                parsed = parsed,
            )
        } else {
            sendObserverObservation(
                baseUrl = baseUrl,
                observerToken = observerToken,
                source = source,
                receivingAccountId = receivingAccountId,
                sender = sender,
                rawText = rawText,
                observedAtMillis = observedAtMillis,
                parsed = parsed,
            )
        }
    }

    private fun sendObserverObservation(
        baseUrl: String,
        observerToken: String,
        source: String,
        receivingAccountId: String,
        sender: String,
        rawText: String,
        observedAtMillis: Long,
        parsed: BankSmsParser.Parsed?,
    ): Outcome {
        val payload = JSONObject().apply {
            put("source", source.ifBlank { "SMS_GATEWAY" })
            put("receivingAccountId", receivingAccountId)
            put("observedAt", iso8601(observedAtMillis))
            put("sender", sender)
            put("rawText", rawText)
            if (parsed != null) {
                put("amount", parsed.amount)
                put("amountPaise", parsed.amountPaise.toString())
                parsed.reference?.let { put("bankReferenceNumber", it) }
                parsed.senderVpa?.let { put("senderVpa", it) }
            }
            put(
                "rawPayload",
                JSONObject().apply {
                    put("text", rawText)
                    put("sender", sender)
                    put("channel", "android_sms")
                },
            )
        }

        return try {
            val response = request(
                url = endpoint(baseUrl, "/api/v1/pollers/events"),
                method = "POST",
                body = payload.toString(),
                authToken = observerToken,
            )
            outcomeOf(response)
        } catch (error: IOException) {
            Outcome(Kind.RETRY, 0, error.message ?: "Network error")
        } catch (error: Exception) {
            Outcome(Kind.FAILED, 0, error.message ?: "Could not reach the gateway")
        }
    }

    private fun sendDeviceObservation(
        baseUrl: String,
        device: Device,
        receivingAccountId: String,
        sender: String,
        rawText: String,
        observedAtMillis: Long,
        parsed: BankSmsParser.Parsed?,
    ): Outcome {
        // The device route re-parses the raw SMS and reads it from `sms`/`body`.
        val payload = JSONObject().apply {
            put("sms", rawText)
            put("body", rawText)
            put("observedAt", iso8601(observedAtMillis))
            put("sender", sender)
            if (receivingAccountId.isNotBlank()) {
                put("receivingAccountId", receivingAccountId)
            }
            if (parsed != null) {
                put("amount", parsed.amount)
                put("amountPaise", parsed.amountPaise.toString())
                parsed.reference?.let { put("bankReferenceNumber", it) }
                parsed.senderVpa?.let { put("senderVpa", it) }
            }
            put(
                "rawPayload",
                JSONObject().apply {
                    put("text", rawText)
                    put("sender", sender)
                    put("channel", "android_sms")
                },
            )
        }

        val body = payload.toString()
        val timestamp = System.currentTimeMillis().toString()
        val signature = hmacSha256("$body:$timestamp", device.signingKey)

        return try {
            val response = request(
                url = endpoint(baseUrl, "/api/v1/observers/sms"),
                method = "POST",
                body = body,
                extraHeaders = mapOf(
                    "X-Device-Id" to device.id,
                    "X-Timestamp" to timestamp,
                    "X-Signature" to signature,
                ),
            )
            outcomeOf(response)
        } catch (error: IOException) {
            Outcome(Kind.RETRY, 0, error.message ?: "Network error")
        } catch (error: Exception) {
            Outcome(Kind.FAILED, 0, error.message ?: "Could not reach the gateway")
        }
    }

    fun fetchActiveWindow(baseUrl: String, observerToken: String): ActiveWindow {
        return try {
            val response = request(
                url = endpoint(baseUrl, "/api/v1/pollers/active-window"),
                method = "GET",
                authToken = observerToken,
            )
            val json = runCatching { JSONObject(response.body) }.getOrNull()
            if (response.code !in 200..299 || json == null) {
                return ActiveWindow(
                    ok = false,
                    httpStatus = response.code,
                    message = reasonOf(json, response.code),
                    sessions = emptyList(),
                )
            }

            val rawSessions = json.optJSONArray("sessions")
            val sessions = buildList {
                if (rawSessions != null) {
                    for (index in 0 until rawSessions.length()) {
                        val item = rawSessions.optJSONObject(index) ?: continue
                        add(
                            Session(
                                receivingAccountId = item.optString("receivingAccountId"),
                                amount = item.optString("amount"),
                                status = item.optString("status"),
                            ),
                        )
                    }
                }
            }

            ActiveWindow(
                ok = true,
                httpStatus = response.code,
                message = if (sessions.isEmpty()) "No live checkout" else "OK",
                sessions = sessions,
            )
        } catch (error: IOException) {
            ActiveWindow(false, 0, error.message ?: "Network error", emptyList())
        } catch (error: Exception) {
            ActiveWindow(false, 0, error.message ?: "Invalid gateway URL", emptyList())
        }
    }

    fun endpoint(baseUrl: String, path: String): String =
        baseUrl.trim().trimEnd('/') + path

    private fun outcomeOf(response: Response): Outcome {
        val json = runCatching { JSONObject(response.body) }.getOrNull()
        return when (response.code) {
            in 200..299 -> {
                val status = json?.optString("status").orEmpty()
                val accepted = if (json?.has("accepted") == true) json.optBoolean("accepted") else true
                val label = when {
                    status.isNotBlank() -> status
                    accepted -> "ACCEPTED"
                    else -> "RECEIVED"
                }
                Outcome(Kind.SENT, response.code, label)
            }

            in 400..499 -> Outcome(
                Kind.FAILED,
                response.code,
                reasonOf(json, response.code),
            )

            else -> Outcome(
                Kind.RETRY,
                response.code,
                "Gateway unavailable (HTTP ${response.code})",
            )
        }
    }

    private data class Response(val code: Int, val body: String)

    private fun request(
        url: String,
        method: String,
        body: String? = null,
        authToken: String? = null,
        extraHeaders: Map<String, String> = emptyMap(),
    ): Response {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            if (!authToken.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $authToken")
            }
            extraHeaders.forEach { (name, value) -> setRequestProperty(name, value) }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }

        try {
            if (body != null) {
                connection.outputStream.use { stream ->
                    stream.write(body.toByteArray(Charsets.UTF_8))
                }
            }

            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return Response(code, text)
        } finally {
            connection.disconnect()
        }
    }

    private fun hmacSha256(data: String, secret: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(data.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }

    private fun reasonOf(json: JSONObject?, fallbackCode: Int): String {
        if (json != null) {
            val reason = json.optString("reason").trim()
            val error = json.optString("error").trim()
            val message = json.optString("message").trim()
            val text = listOf(reason, error, message).firstOrNull { it.isNotBlank() }
            if (text != null) return text.take(400)
        }
        return when (fallbackCode) {
            401, 403 -> "Rejected: the gateway did not accept these credentials"
            404 -> "Rejected: endpoint not found"
            0 -> "Could not reach the gateway"
            else -> "Rejected with HTTP $fallbackCode"
        }
    }

    private fun iso8601(millis: Long): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date(millis))
    }
}
