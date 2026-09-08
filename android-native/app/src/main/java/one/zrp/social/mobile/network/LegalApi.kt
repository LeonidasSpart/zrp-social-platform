package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * One card/step/plan/table-row inside a section's body - see
 * LegalContentResponse's own KDoc for what each optional field means for
 * a given block "type". Every field here is real page copy resolved
 * server-side from the same translations object the website itself reads
 * from (src/lib/translations.ts via src/lib/legal-content.ts) - never
 * hand-duplicated into this app.
 */
data class LegalCard(
    val title: String?,
    val text: String?,
    // Ordered extra fragments: a price + billing period + feature list, an
    // email address, a report/block step list, a table-row's per-plan
    // values, etc. - what it holds depends on which section it's in.
    val meta: List<String>?,
)

data class LegalFaqItem(
    val question: String,
    val answer: String,
)

data class LegalTableRow(
    val label: String,
    val values: List<String>,
)

/**
 * One block of a section's body, in real page order. `type` says which of
 * the other (nullable) fields are populated for this block:
 *  - "heading"   -> text
 *  - "paragraph" -> text (+ style == "callout" for an accented/callout box)
 *  - "bullets"   -> items
 *  - "cards"     -> cards
 *  - "table"     -> headers + rows
 *  - "faq"       -> faqItems
 *
 * Deliberately not a sealed class: Gson (this app's Retrofit converter,
 * same as every other *Api.kt) deserializes JSON polymorphically only
 * with a custom TypeAdapter, and nothing else in this codebase registers
 * one. A single flat data class with type-specific fields left null when
 * not applicable parses with Gson's default reflection, same as every
 * other response model here.
 */
data class LegalBlock(
    val type: String,
    val text: String?,
    val style: String?,
    val items: List<String>?,
    val cards: List<LegalCard>?,
    val headers: List<String>?,
    val rows: List<LegalTableRow>?,
    val faqItems: List<LegalFaqItem>?,
)

data class LegalSection(
    val id: String,
    val number: String?,
    val title: String,
    val body: List<LegalBlock>,
)

/**
 * Response of GET /api/legal/{page} - src/app/api/legal/[page]/route.ts.
 * Every string is read live, server-side, from the same translations
 * object (src/lib/translations.ts) the real web pages at /terms,
 * /privacy, /guidelines, /help and /contact already render through
 * useLanguage()/t() - this is not a second, hand-maintained copy of the
 * legal/help text, just a native rendering of the same source of truth.
 */
data class LegalContentResponse(
    val page: String,
    val lang: String,
    val title: String,
    val subtitle: String?,
    val sections: List<LegalSection>,
)

interface LegalApi {
    @GET("legal/{page}")
    suspend fun getLegalContent(
        @Path("page") page: String,
        @Query("lang") lang: String,
    ): LegalContentResponse
}
