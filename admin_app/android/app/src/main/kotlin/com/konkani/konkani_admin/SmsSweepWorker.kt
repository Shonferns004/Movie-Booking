package com.konkani.konkani_admin

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Periodic safety net. The broadcast receiver handles SMS in real time; this job
 * catches anything that was delivered while the process was dead and drains the
 * pending queue even if the app has not been opened for a while.
 */
class SmsSweepWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val store = ObserverStore(applicationContext)
        val config = store.config()
        if (!config.enabled || !config.isConfigured) return@withContext Result.success()

        SmsInboxSweeper.sweep(applicationContext)
        SmsIngestWorker.enqueue(applicationContext)
        Result.success()
    }

    companion object {
        private const val UNIQUE_WORK = "konkani-sms-sweep"

        /** Idempotent: repeated calls keep the existing schedule. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SmsSweepWorker>(
                15,
                TimeUnit.MINUTES,
            ).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK)
        }
    }
}
