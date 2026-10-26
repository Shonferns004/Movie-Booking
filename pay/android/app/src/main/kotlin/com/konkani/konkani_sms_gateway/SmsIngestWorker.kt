package com.konkani.konkani_sms_gateway

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Drains the pending observation queue against the gateway.
 *
 * Delivery semantics:
 *  - 2xx            -> `sent`   (the body may still carry a business rejection)
 *  - 4xx            -> `failed` (retrying will not change the answer)
 *  - 5xx / network  -> stays `pending`, WorkManager backs off exponentially
 */
class SmsIngestWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val store = ObserverStore(applicationContext)
        val config = store.config()

        if (!config.enabled) return@withContext Result.success()
        if (!config.isConfigured) return@withContext Result.success()

        val pending = store.events().filter { it.status == STATUS_PENDING }
        if (pending.isEmpty()) return@withContext Result.success()

        var shouldRetry = false
        val device = if (config.isPaired) {
            GatewayClient.Device(config.deviceId, config.deviceSigningKey)
        } else {
            null
        }
        var resolvedAccountId = config.receivingAccountId

        for (event in pending) {
            if (event.attempts >= MAX_ATTEMPTS) {
                store.updateEvent(
                    event.copy(
                        status = STATUS_FAILED,
                        message = "Gave up after $MAX_ATTEMPTS attempts",
                    ),
                )
                continue
            }

            // Paired devices are attributed by their merchant on the gateway, so
            // only observer-token installs need a live checkout lookup.
            if (device == null && resolvedAccountId.isBlank()) {
                val window = GatewayClient.fetchActiveWindow(config.baseUrl, config.observerToken)
                val candidates = window.sessions
                    .map { it.receivingAccountId }
                    .filter { it.isNotBlank() }
                    .distinct()

                if (candidates.size == 1) {
                    resolvedAccountId = candidates.first()
                    store.setReceivingAccountId(resolvedAccountId)
                } else {
                    store.updateEvent(
                        event.copy(
                            attempts = event.attempts + 1,
                            message = if (candidates.isEmpty()) {
                                "Waiting for a live checkout to resolve the receiving account"
                            } else {
                                "Several live accounts — set the receiving account in Settings"
                            },
                        ),
                    )
                    shouldRetry = true
                    continue
                }
            }

            val parsed = BankSmsParser.parse(event.body)
            val outcome = GatewayClient.sendObservation(
                baseUrl = config.baseUrl,
                observerToken = config.observerToken,
                device = device,
                source = config.source,
                receivingAccountId = resolvedAccountId,
                sender = event.sender,
                rawText = event.body,
                observedAtMillis = event.receivedAt,
                parsed = parsed,
            )

            when (outcome.kind) {
                GatewayClient.Kind.SENT -> store.updateEvent(
                    event.copy(
                        status = STATUS_SENT,
                        httpStatus = outcome.httpStatus,
                        message = outcome.message,
                        attempts = event.attempts + 1,
                    ),
                )

                GatewayClient.Kind.FAILED -> store.updateEvent(
                    event.copy(
                        status = STATUS_FAILED,
                        httpStatus = outcome.httpStatus,
                        message = outcome.message,
                        attempts = event.attempts + 1,
                    ),
                )

                GatewayClient.Kind.RETRY -> {
                    store.updateEvent(
                        event.copy(
                            httpStatus = outcome.httpStatus,
                            message = outcome.message,
                            attempts = event.attempts + 1,
                        ),
                    )
                    shouldRetry = true
                }
            }
        }

        if (shouldRetry) Result.retry() else Result.success()
    }

    companion object {
        private const val UNIQUE_WORK = "konkani-sms-ingest"
        private const val MAX_ATTEMPTS = 20

        /** Idempotent enqueue from the receiver, the UI and the retry action. */
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<SmsIngestWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_WORK,
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request,
            )
        }
    }
}
