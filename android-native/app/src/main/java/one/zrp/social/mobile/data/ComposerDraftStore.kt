package one.zrp.social.mobile.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The plain SharedPreferences equivalent of PostComposer.tsx's own
 * draft-protection block (localStorage["zrp:composer:draft"]) - a
 * draft post's own text/media is no more sensitive than any other
 * locally-cached UI state, unlike TokenStore's session token, so this
 * skips EncryptedSharedPreferences entirely.
 */
class ComposerDraftStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    data class Draft(val content: String, val mediaUrls: List<String>, val mediaType: String?)

    fun load(): Draft? {
        val raw = prefs.getString(KEY_DRAFT, null) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            val content = json.optString("content", "")
            val urls = json.optJSONArray("mediaUrls") ?: JSONArray()
            val mediaUrls = (0 until urls.length()).map { urls.getString(it) }
            val mediaType = json.optString("mediaType", "").takeIf { it == "image" || it == "video" }
            Draft(content, mediaUrls, mediaType)
        }.getOrNull()
    }

    // Matches PostComposer.tsx's own save effect exactly: a draft with
    // no real text and no media is removed rather than kept as an
    // empty stub.
    fun save(content: String, mediaUrls: List<String>, mediaType: String?) {
        if (content.isBlank() && mediaUrls.isEmpty()) {
            clear()
            return
        }
        val json = JSONObject().apply {
            put("content", content)
            put("mediaUrls", JSONArray(mediaUrls))
            put("mediaType", mediaType ?: "")
        }
        prefs.edit().putString(KEY_DRAFT, json.toString()).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_DRAFT).apply()
    }

    companion object {
        private const val PREFS_NAME = "zrp_composer_draft"
        private const val KEY_DRAFT = "draft"
    }
}
