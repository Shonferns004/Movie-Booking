package com.konkani.konkani_sms_gateway

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * The only surface the Flutter layer talks to. Keeping the state and the HTTP
 * client on the Android side means the observer keeps working (and keeps the
 * same settings) when no Dart isolate is alive.
 */
class GatewayBridge(
    private val activity: Activity,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler {

    private val channel = MethodChannel(messenger, CHANNEL)
    private val store by lazy { ObserverStore(activity) }
    private var pendingPermission: MethodChannel.Result? = null

    fun attach() {
        channel.setMethodCallHandler(this)
        // Best-effort liveness ping so a freshly paired phone shows up as online.
        val config = store.config()
        if (config.isPaired) {
            Thread { GatewayClient.heartbeat(config.baseUrl, config.deviceId) }.start()
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getState" -> result.success(buildState())

            "saveConfig" -> handleSaveConfig(call, result)

            "pairDevice" -> handlePairDevice(call, result)

            "unpairDevice" -> {
                store.clearPairedDevice()
                result.success(buildState())
            }

            "setEnabled" -> {
                val enabled = (call.arguments as? Map<*, *>)?.get("enabled") as? Boolean
                if (enabled == null) {
                    result.error("BAD_ARGS", "enabled is required", null)
                    return
                }
                val config = store.config()
                store.saveConfig(config.copy(enabled = enabled))
                if (enabled) SmsIngestWorker.enqueue(activity)
                result.success(buildState())
            }

            "clearLog" -> {
                store.clearLog()
                result.success(buildState())
            }

            "flushQueue" -> {
                SmsIngestWorker.enqueue(activity)
                result.success(buildState())
            }

            "requestSmsPermission" -> requestPermissions(
                arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS),
                REQUEST_SMS,
                result,
            )

            "requestNotificationPermission" -> requestNotificationPermission(result)

            "openAppSettings" -> {
                openAppSettings()
                result.success(null)
            }

            "parsePreview" -> {
                val text = (call.arguments as? Map<*, *>)?.get("text") as? String
                val parsed = BankSmsParser.parse(text)
                result.success(
                    parsed?.let {
                        mapOf(
                            "amount" to it.amount,
                            "amountPaise" to it.amountPaise,
                            "reference" to it.reference,
                            "senderVpa" to it.senderVpa,
                        )
                    },
                )
            }

            "fetchActiveWindow" -> fetchActiveWindow(result)

            "testSend" -> testSend(call, result)

            else -> result.notImplemented()
        }
    }

    fun onPermissionResult(requestCode: Int, grantResults: IntArray) {
        if (requestCode != REQUEST_SMS && requestCode != REQUEST_NOTIFICATIONS) return
        val pending = pendingPermission ?: return
        pendingPermission = null
        val granted = grantResults.isNotEmpty() &&
            grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        pending.success(mapOf("granted" to granted))
    }

    private fun handleSaveConfig(call: MethodCall, result: MethodChannel.Result) {
        val args = call.arguments as? Map<*, *>
        if (args == null) {
            result.error("BAD_ARGS", "Missing configuration", null)
            return
        }

        val existing = store.config()
        val baseUrl = (args["baseUrl"] as? String)?.trim().orEmpty()
        val token = (args["observerToken"] as? String)?.trim().orEmpty()
        if (baseUrl.isEmpty()) {
            result.error("BAD_ARGS", "Gateway URL is required", null)
            return
        }
        if (token.isEmpty() && !existing.isPaired) {
            result.error(
                "BAD_ARGS",
                "Observer token is required unless this device is paired.",
                null,
            )
            return
        }

        // The device credentials are owned by the pairing exchange, so a normal
        // settings save must never wipe them.
        val config = ObserverConfig(
            baseUrl = baseUrl,
            observerToken = token,
            receivingAccountId = (args["receivingAccountId"] as? String)?.trim().orEmpty(),
            source = (args["source"] as? String)?.trim().orEmpty().ifBlank { "SMS_GATEWAY" },
            senderFilter = (args["senderFilter"] as? String)?.trim().orEmpty(),
            enabled = (args["enabled"] as? Boolean) ?: existing.enabled,
            deviceId = existing.deviceId,
            deviceSigningKey = existing.deviceSigningKey,
            deviceMerchantId = existing.deviceMerchantId,
        )
        store.saveConfig(config)
        result.success(buildState())
    }

    /**
     * Exchanges the admin panel's enrollment secret (or full pairing QR JSON)
     * for a device id + HMAC signing key.
     */
    private fun handlePairDevice(call: MethodCall, result: MethodChannel.Result) {
        val args = call.arguments as? Map<*, *>
        val secret = (args?.get("secret") as? String)?.trim().orEmpty()
        if (secret.isEmpty()) {
            result.error("BAD_ARGS", "Paste the enrollment secret first", null)
            return
        }

        val input = GatewayClient.parsePairingInput(secret)
        if (input == null) {
            result.error("BAD_ARGS", "That is not a valid enrollment secret or pairing QR payload", null)
            return
        }

        val existing = store.config()
        val requestedBase = (args?.get("baseUrl") as? String)?.trim().orEmpty()
        val baseUrl = normalizeUrl(requestedBase.ifBlank { existing.baseUrl })
        if (baseUrl.isEmpty()) {
            result.error("BAD_ARGS", "Set the gateway base URL before pairing", null)
            return
        }
        if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
            result.error("BAD_ARGS", "Gateway URL must start with http:// or https://", null)
            return
        }

        val deviceModel = (args?.get("deviceModel") as? String)?.trim().orEmpty()
            .ifBlank { Build.MODEL.ifBlank { "Android Device" } }
        val deviceName = (args?.get("deviceName") as? String)?.trim().orEmpty()
            .ifBlank {
                "${Build.MANUFACTURER} ${Build.MODEL}".trim()
                    .ifBlank { "Android SMS Gateway" }
            }

        Thread {
            val paired = GatewayClient.pairDevice(
                baseUrl = baseUrl,
                input = input,
                deviceName = deviceName,
                deviceModel = deviceModel,
            )

            if (paired.ok) {
                store.saveConfig(
                    store.config().copy(
                        baseUrl = baseUrl,
                        deviceId = paired.deviceId,
                        deviceSigningKey = paired.signingKey,
                        deviceMerchantId = paired.merchantId,
                    ),
                )
                // Flip the panel's online badge immediately instead of waiting
                // for the first SMS or the next app start.
                GatewayClient.heartbeat(baseUrl, paired.deviceId)
            }

            activity.runOnUiThread {
                result.success(
                    mapOf(
                        "ok" to paired.ok,
                        "httpStatus" to paired.httpStatus,
                        "message" to paired.message,
                        "paired" to paired.ok,
                        "deviceId" to paired.deviceId,
                        "merchantId" to paired.merchantId,
                    ),
                )
            }
        }.start()
    }

    private fun requestPermissions(
        permissions: Array<String>,
        requestCode: Int,
        result: MethodChannel.Result,
    ) {
        val missing = permissions.filterNot { hasPermission(it) }
        if (missing.isEmpty()) {
            result.success(mapOf("granted" to true))
            return
        }
        if (pendingPermission != null) {
            result.error("BUSY", "A permission request is already in progress", null)
            return
        }
        pendingPermission = result
        activity.requestPermissions(missing.toTypedArray(), requestCode)
    }

    private fun requestNotificationPermission(result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            result.success(mapOf("granted" to true))
            return
        }
        requestPermissions(
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            REQUEST_NOTIFICATIONS,
            result,
        )
    }

    private fun fetchActiveWindow(result: MethodChannel.Result) {
        val config = store.config()
        if (!config.isConfigured) {
            result.success(
                mapOf(
                    "ok" to false,
                    "httpStatus" to 0,
                    "message" to "Save the gateway URL and credentials first.",
                    "sessions" to emptyList<Any>(),
                ),
            )
            return
        }

        // The active-window endpoint is bearer-token only. A paired device has
        // no observer token; the gateway resolves its receiving account from
        // the merchant, so there is nothing to look up here.
        if (config.observerToken.isBlank()) {
            result.success(
                mapOf(
                    "ok" to true,
                    "httpStatus" to 0,
                    "message" to
                        "Paired device — the gateway resolves the receiving account.",
                    "sessions" to emptyList<Any>(),
                ),
            )
            return
        }

        Thread {
            val window = GatewayClient.fetchActiveWindow(config.baseUrl, config.observerToken)
            activity.runOnUiThread {
                result.success(
                    mapOf(
                        "ok" to window.ok,
                        "httpStatus" to window.httpStatus,
                        "message" to window.message,
                        "sessions" to window.sessions.map {
                            mapOf(
                                "receivingAccountId" to it.receivingAccountId,
                                "amount" to it.amount,
                                "status" to it.status,
                            )
                        },
                    ),
                )
            }
        }.start()
    }

    private fun testSend(call: MethodCall, result: MethodChannel.Result) {
        val args = call.arguments as? Map<*, *>
        val text = (args?.get("text") as? String)?.trim().orEmpty()
        val sender = (args?.get("sender") as? String)?.trim().orEmpty().ifBlank { "TEST" }

        if (text.isEmpty()) {
            result.error("BAD_ARGS", "Message text is required", null)
            return
        }

        val config = store.config()
        if (!config.isConfigured) {
            result.success(
                mapOf(
                    "ok" to false,
                    "httpStatus" to 0,
                    "message" to "Save the gateway URL and credentials first.",
                ),
            )
            return
        }

        Thread {
            val device = if (config.isPaired) {
                GatewayClient.Device(config.deviceId, config.deviceSigningKey)
            } else {
                null
            }

            var accountId = config.receivingAccountId
            var note = ""

            // Paired devices are attributed server-side from their merchant;
            // resolving a live checkout is only needed on the token transport.
            if (device == null && accountId.isBlank()) {
                val window = GatewayClient.fetchActiveWindow(config.baseUrl, config.observerToken)
                val candidates = window.sessions
                    .map { it.receivingAccountId }
                    .filter { it.isNotBlank() }
                    .distinct()
                if (candidates.size == 1) {
                    accountId = candidates.first()
                } else {
                    note = "No single live checkout to resolve the receiving account. "
                }
            }

            if (device == null && accountId.isBlank()) {
                activity.runOnUiThread {
                    result.success(
                        mapOf(
                            "ok" to false,
                            "httpStatus" to 0,
                            "message" to
                                (note + "Set the receiving account in Settings."),
                        ),
                    )
                }
                return@Thread
            }

            val outcome = GatewayClient.sendObservation(
                baseUrl = config.baseUrl,
                observerToken = config.observerToken,
                device = device,
                source = config.source,
                receivingAccountId = accountId,
                sender = sender,
                rawText = text,
                observedAtMillis = System.currentTimeMillis(),
                parsed = BankSmsParser.parse(text),
            )

            activity.runOnUiThread {
                result.success(
                    mapOf(
                        "ok" to (outcome.kind == GatewayClient.Kind.SENT),
                        "httpStatus" to outcome.httpStatus,
                        "message" to (note + outcome.message),
                        "response" to null,
                    ),
                )
            }
        }.start()
    }

    private fun openAppSettings() {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", activity.packageName, null),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
    }

    private fun buildState(): Map<String, Any?> {
        val config = store.config()
        return mapOf(
            "config" to mapOf(
                "baseUrl" to config.baseUrl,
                "observerToken" to config.observerToken,
                "receivingAccountId" to config.receivingAccountId,
                "source" to config.source,
                "senderFilter" to config.senderFilter,
                "enabled" to config.enabled,
                "paired" to config.isPaired,
                "deviceId" to config.deviceId,
                "deviceMerchantId" to config.deviceMerchantId,
            ),
            "stats" to store.stats(),
            "events" to store.events().take(LOG_PAGE).map(::eventToMap),
            "smsPermission" to hasPermission(Manifest.permission.RECEIVE_SMS),
            "notificationsPermission" to notificationsGranted(),
        )
    }

    private fun eventToMap(event: ObserverEvent): Map<String, Any?> = mapOf(
        "id" to event.id,
        "sender" to event.sender,
        "body" to event.body,
        "receivedAt" to event.receivedAt,
        "status" to event.status,
        "amount" to event.amount,
        "amountPaise" to event.amountPaise,
        "reference" to event.reference,
        "httpStatus" to event.httpStatus,
        "message" to event.message,
        "attempts" to event.attempts,
    )

    private fun hasPermission(permission: String): Boolean =
        activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun notificationsGranted(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasPermission(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            true
        }

    private fun normalizeUrl(raw: String): String {
        var value = raw.trim()
        while (value.endsWith("/")) value = value.dropLast(1)
        return value
    }

    companion object {
        private const val CHANNEL = "konkani.sms_gateway/bridge"
        private const val REQUEST_SMS = 4801
        private const val REQUEST_NOTIFICATIONS = 4802
        private const val LOG_PAGE = 150
    }
}
