package com.konkani.konkani_sms_gateway

/**
 * Android port of `@youpi/core`'s BankSmsParser.
 *
 * The gateway re-parses every raw message on its own — this copy exists so the
 * device can decide whether a message is a bank credit before spending a
 * network round trip, and so the UI can preview what the parser sees.
 */
object BankSmsParser {

    data class Parsed(
        val amount: String,
        val amountPaise: Long,
        val reference: String?,
        val senderVpa: String?,
    )

    private val CREDIT_KEYWORDS =
        Regex("""(credited|received|deposit|payment received|payment|upi/cr|transferred)""", RegexOption.IGNORE_CASE)

    private val DEBIT_KEYWORDS =
        Regex("""(debited|withdrawn|sent rs|paid rs)""", RegexOption.IGNORE_CASE)

    private val CREDIT_OR_DEPOSIT =
        Regex("""(credited|received|deposit)""", RegexOption.IGNORE_CASE)

    private val CURRENCY_PREFIX =
        Regex("""(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)

    private val CURRENCY_SUFFIX =
        Regex("""([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)""", RegexOption.IGNORE_CASE)

    private val CREDIT_PROXIMITY = Regex(
        """(?:credited|received|deposit|payment|paid|transferred|upi|cr)[\s\w:]*?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)[\s\w:]*?(?:credited|received|deposit|payment|paid|transferred|upi|cr)""",
        RegexOption.IGNORE_CASE,
    )

    private val STANDALONE_DECIMAL = Regex("""\b(\d{1,6}\.\d{2})\b""")

    private val REFERENCE = Regex(
        """(?:utr|ref(?:\s*no)?|txn(?:\s*id)?|rrn)[:\s#]+([a-zA-Z0-9\-_]{6,35})""",
        RegexOption.IGNORE_CASE,
    )

    private val UPI_CR_REFERENCE =
        Regex("""UPI/CR/([a-zA-Z0-9\-_]+)""", RegexOption.IGNORE_CASE)

    private val VPA_WITH_LEAD =
        Regex("""(?:from|by)\s+([a-zA-Z0-9.\-_]{2,100}@[a-zA-Z0-9.\-_]{2,64})""", RegexOption.IGNORE_CASE)

    private val VPA_ANY = Regex("""([a-zA-Z0-9.\-_]{2,100}@[a-zA-Z0-9.\-_]{2,64})""")

    private val VALID_AMOUNT = Regex("""^\d+(\.\d{1,2})?$""")

    /** Returns null when the message is not an incoming credit. */
    fun parse(text: String?): Parsed? {
        val body = text?.trim().orEmpty()
        if (body.isEmpty()) return null
        if (!CREDIT_KEYWORDS.containsMatchIn(body)) return null
        if (DEBIT_KEYWORDS.containsMatchIn(body) && !CREDIT_OR_DEPOSIT.containsMatchIn(body)) {
            return null
        }

        val amount = extractAmount(body) ?: return null
        val reference = extractReference(body)
        val senderVpa = extractVpa(body)

        return Parsed(
            amount = amount.first,
            amountPaise = amount.second,
            reference = reference,
            senderVpa = senderVpa,
        )
    }

    /** Mirrors `extractIntelligentAmount`: prefix, suffix, proximity, decimal. */
    private fun extractAmount(text: String): Pair<String, Long>? {
        CURRENCY_PREFIX.find(text)?.groupValues?.getOrNull(1)?.let { match ->
            paiseOf(match)?.let { return match.replace(",", "") to it }
        }

        CURRENCY_SUFFIX.find(text)?.groupValues?.getOrNull(1)?.let { match ->
            paiseOf(match)?.let { return match.replace(",", "") to it }
        }

        CREDIT_PROXIMITY.find(text)?.let { match ->
            val raw = match.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() }
                ?: match.groupValues.getOrNull(2)?.takeIf { it.isNotEmpty() }
            if (raw != null) {
                val clean = raw.replace(",", "")
                val value = clean.toDoubleOrNull()
                if (value != null && value > 0 && value < 10_000_000) {
                    paiseOf(clean)?.let { return clean to it }
                }
            }
        }

        STANDALONE_DECIMAL.find(text)?.groupValues?.getOrNull(1)?.let { match ->
            paiseOf(match)?.let { return match to it }
        }

        return null
    }

    private fun extractReference(text: String): String? {
        REFERENCE.find(text)?.groupValues?.getOrNull(1)?.trim()?.let { return it }
        UPI_CR_REFERENCE.find(text)?.groupValues?.getOrNull(1)?.trim()?.let { return it }
        return null
    }

    private fun extractVpa(text: String): String? {
        val match = VPA_WITH_LEAD.find(text) ?: VPA_ANY.find(text)
        return match?.groupValues
            ?.getOrNull(1)
            ?.trim()
            ?.trimEnd('.', ',', ';')
            ?.takeIf { it.isNotEmpty() }
    }

    /** Strict rupee -> paise conversion; rejects anything `toPaise` would. */
    private fun paiseOf(value: String): Long? {
        val clean = value.replace(",", "").trim()
        if (!VALID_AMOUNT.matches(clean)) return null
        val parts = clean.split(".")
        val whole = parts[0].toLongOrNull() ?: return null
        val fraction = (parts.getOrNull(1) ?: "").padEnd(2, '0').toLongOrNull() ?: return null
        val paise = whole * 100 + fraction
        return if (paise > 0) paise else null
    }
}
