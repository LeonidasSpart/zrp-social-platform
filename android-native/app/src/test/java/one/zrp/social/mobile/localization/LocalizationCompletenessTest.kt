package one.zrp.social.mobile.localization

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

/**
 * Localization completeness gate for Android's string resources.
 *
 * Found via a real audit (the Android app grew from 11 to 15 supported
 * languages - see SupportedLanguages.kt - and separately, a few keys
 * like nav_shorts/nav_play/nav_opportunity/nav_aid/shorts_title were
 * left untranslated in English across every non-English language,
 * mirroring the exact same bug once found and fixed on the website).
 * This is a permanent build-time gate, not a one-time audit: it fails
 * `./gradlew testDebugUnitTest` (already run in CI - see
 * android-native-build.yml) the moment any of the following regresses:
 *
 *   1. A language directory loses a key present in the English default
 *      (values/strings.xml), or gains one the default doesn't have.
 *   2. A translated value is an empty string.
 *   3. A translated value is an un-reviewed byte-for-byte copy of the
 *      English source - i.e. never actually translated. A small,
 *      hand-reviewed per-language allowlist of genuine cognates/
 *      loanwords/brand names/technical placeholders is exempted; a
 *      value NOT in that allowlist that turns up identical to English
 *      fails immediately, so a future untranslated key is caught
 *      instead of shipping silently (exactly the class of bug that
 *      prompted this test).
 *   4. A `%N$s`/`%N$d` positional format-argument token present in the
 *      English source is missing from a translation (a real crash/
 *      display-bug risk: Android's `String.format` silently no-ops a
 *      substitution whose format string doesn't contain the matching
 *      token, or throws `MissingFormatArgumentException` the other way
 *      around).
 *   5. A `<plurals>` resource is missing a language override, or a
 *      quantity item's placeholder doesn't match the English source.
 *
 * This is a plain JVM test (no Android framework / Robolectric needed)
 * - it reads the actual `res/values*/strings.xml` files straight off
 * disk with the standard JDK DOM parser, the same way a human auditing
 * the repo would.
 */
class LocalizationCompletenessTest {

    private val resDir: File = run {
        // Gradle's testDebugUnitTest working directory is this module's
        // project directory (android-native/app), but resolve robustly
        // by walking up from the working directory just in case.
        var dir = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var found: File? = null
        repeat(6) {
            val candidate = File(dir, "src/main/res")
            if (File(candidate, "values/strings.xml").exists()) {
                found = candidate
            }
            dir = dir.parentFile ?: dir
        }
        found ?: throw IllegalStateException(
            "Could not locate src/main/res/values/strings.xml from working directory " +
                (System.getProperty("user.dir") ?: "?")
        )
    }

    private data class ParsedResources(
        val strings: Map<String, String>,
        val plurals: Map<String, Map<String, String>>,
    )

    private fun parseStringsXml(file: File): ParsedResources {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val root = doc.documentElement
        val strings = LinkedHashMap<String, String>()
        val plurals = LinkedHashMap<String, MutableMap<String, String>>()
        val children = root.childNodes
        for (i in 0 until children.length) {
            val node = children.item(i)
            if (node !is Element) continue
            when (node.tagName) {
                "string" -> {
                    if (node.getAttribute("translatable") == "false") continue
                    strings[node.getAttribute("name")] = node.textContent ?: ""
                }
                "plurals" -> {
                    val name = node.getAttribute("name")
                    val items = LinkedHashMap<String, String>()
                    val itemNodes = node.childNodes
                    for (j in 0 until itemNodes.length) {
                        val itemNode = itemNodes.item(j)
                        if (itemNode !is Element || itemNode.tagName != "item") continue
                        items[itemNode.getAttribute("quantity")] = itemNode.textContent ?: ""
                    }
                    plurals[name] = items
                }
            }
        }
        return ParsedResources(strings, plurals)
    }

    private val languages = listOf("fr", "de", "it", "sq", "es", "ru", "ar", "zh", "tr", "id", "pt", "ja", "ko", "hi")

    private val placeholderRegex = Regex("""%\d+\$[sd]|\{[a-zA-Z]+\}""")

    // %2$s in team_member_count/api_keys_key_count is an English-only
    // pluralization suffix (the caller passes "" or "s"); languages
    // that pluralize via inflection instead (German "Mitglied(er)",
    // Italian "membro/i", Spanish "miembro(s)", Albanian "anëtar(ë)")
    // correctly omit it.
    private val optionalTokens = setOf("%2$s")

    /**
     * Values legitimately identical to English in EVERY language: ZRP's
     * own plan-tier brand names, "ZRP <Feature>" product names, format-
     * only strings (numerals/symbols/emoji), technical placeholders
     * (URLs, slugs), and third-party attribution text.
     */
    private val universalAllowlist = setOf(
        "Free", "Pro", "Business", "Enterprise",
        "Admin", "Slug", "Legal", "Website", "Emoji", "Spam", "Editor",
        "Trivia", "Global", "Offline", "vs", "24/7",
        "ZRP", "ZRP Social", "ZRP AI", "ZRP PLAY", "ZRP OPPORTUNITY", "ZRP HELP",
        "ZRP Market Plus", "ZRP News", "ZRP Trust Passport", "Music Studio",
        "Powered by DeepSeek",
        "https://...", "https://…", "https://your-site.com", "https://your-website.com",
        "user@example.com", "article-slug",
    )

    /**
     * Per-language allowlists of translation keys whose value is
     * legitimately identical to the English source IN THAT LANGUAGE
     * SPECIFICALLY - reviewed by hand, one language at a time, mirroring
     * the same audit already done for the web dictionary
     * (src/lib/__tests__/translations-completeness.test.ts). Real
     * cognates and loanwords a native speaker would actually use
     * (French "Message"/"Admin", German/Turkish/Indonesian "Video"/
     * "Blockchain", Indonesian "Email"/"Bio"/"Global" as everyday
     * loanwords, etc.), plus format-only strings that don't need
     * per-language localization.
     *
     * This is a FROZEN baseline, not a growing allowlist: anything
     * identical to English in a given language that ISN'T already in
     * that language's list here fails the test below.
     */
    private val perLanguageAllowlist: Map<String, Set<String>> = mapOf(
        "fr" to setOf(
            "action_message",
            "admin_ads_budget",
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_audit_filter_action",
            "admin_charity_cause",
            "admin_dash_admins",
            "admin_nav_label",
            "admin_news_network_publication_meta",
            "admin_news_network_source_health",
            "admin_news_network_story_context",
            "admin_news_network_story_meta",
            "admin_news_network_tab_publications",
            "admin_news_network_tab_sources",
            "admin_news_url_placeholder",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_reports_action",
            "admin_support_stat_total",
            "admin_ticket_admin_badge",
            "admin_upgrade_requests_plan_change",
            "admin_users_admins",
            "admin_users_col_actions",
            "admin_users_role_admin",
            "admin_users_total",
            "aid_contributions_count",
            "aid_description_label",
            "aid_hero_title",
            "aid_images_label",
            "aid_status_active",
            "ambassadors_region_europe",
            "api_keys_col_actions",
            "auth_welcome_title",
            "chat_attachment_fallback",
            "chat_voice_pause_cd",
            "createpost_poll_option",
            "creator_content_reposts",
            "creator_tab_audience",
            "creator_table_date",
            "creator_table_message",
            "drawer_section_services",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug",
            "legal_contact",
            "legal_faq",
            "marketplace_description",
            "marketplace_hero_title",
            "marketplace_photos",
            "marketplace_status_active",
            "music_album_detail_eyebrow",
            "music_albums_title",
            "music_artist_detail_albums_heading",
            "music_artist_detail_singles_heading",
            "music_duration_minutes",
            "music_pause",
            "music_playlists_title",
            "music_shell_genre_placeholder",
            "music_shell_genres_heading",
            "music_studio_tab_albums",
            "music_title",
            "nav_admin",
            "nav_marketplace",
            "nav_messages",
            "nav_notifications",
            "news_category_crypto",
            "news_category_culture",
            "news_category_europe",
            "news_category_science",
            "news_source",
            "news_title",
            "onboarding_bio",
            "opportunity_description_label",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_status_active",
            "opportunity_type_collaboration",
            "opportunity_type_freelance",
            "opportunity_type_hackathon",
            "opportunity_type_label",
            "play_duels_title",
            "play_hero_title",
            "play_option_placeholder",
            "play_questions_label",
            "play_xp",
            "poll_option_result",
            "pricing_plan_business",
            "pricing_plan_pro",
            "pricing_support_247",
            "pricing_support_standard",
            "reaction_emoji_label",
            "report_reason_spam",
            "settings_bio",
            "settings_group_support",
            "settings_notif_mentions",
            "stories_image",
            "support_category_bug",
            "support_detail_support_badge",
            "support_message_label",
            "team_col_actions",
            "team_role_admin",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "de" to setOf(
            "action_repost",
            "admin_ads_budget",
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_analytics_reposts",
            "admin_audit_metadata",
            "admin_dash_admins",
            "admin_dash_title",
            "admin_nav_label",
            "admin_news_feedback_prefix",
            "admin_news_network_pilot",
            "admin_news_network_publication_meta",
            "admin_news_network_tab_feeds",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_payments_tx",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_reports_details",
            "admin_storage_stat_in_uploadthing",
            "admin_ticket_admin_badge",
            "admin_ticket_plan",
            "admin_ticket_status_field",
            "admin_upgrade_requests_plan_change",
            "admin_users_admins",
            "admin_users_col_status",
            "admin_users_mods",
            "admin_users_role_admin",
            "admin_users_role_moderator",
            "admin_withdrawals_wallet",
            "aid_hero_title",
            "ambassadors_admin_motivation_label",
            "ambassadors_level_community_leader",
            "api_keys_col_name",
            "auth_welcome_title",
            "chat_contact_video",
            "chat_offline",
            "chat_voice_pause_cd",
            "comment_repost_cd",
            "createpost_poll_option",
            "creator_content_likes",
            "creator_content_reposts",
            "creator_studio_title",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug",
            "legal_faq",
            "marketplace_hero_title",
            "marketplace_video_optional",
            "music_album_detail_eyebrow",
            "music_artist_detail_singles_heading",
            "music_pause",
            "music_playlists_title",
            "music_shell_genre_placeholder",
            "music_shell_genres_heading",
            "music_title",
            "nav_admin",
            "nav_creator_studio",
            "nav_journalist",
            "news_category_community",
            "news_title",
            "onboarding_bio",
            "onboarding_website",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_remote",
            "opportunity_type_freelance",
            "opportunity_type_hackathon",
            "opportunity_type_job",
            "play_hero_title",
            "play_level",
            "play_logic_answer_type_choice",
            "play_option_placeholder",
            "play_xp",
            "pricing_feature_support",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "pricing_support_247",
            "pricing_support_standard",
            "profile_reposts",
            "profile_trust_passport_title",
            "reaction_emoji_label",
            "report_reason_spam",
            "reposts_title",
            "settings_bio",
            "settings_group_support",
            "settings_website",
            "shorts_repost",
            "stories_video",
            "support_category_moderation",
            "support_detail_priority_normal",
            "support_detail_status_label",
            "support_detail_support_badge",
            "team_role_admin",
            "team_role_editor",
            "trust_category_community",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "it" to setOf(
            "admin_ads_budget",
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_dash_title",
            "admin_nav_label",
            "admin_news_feedback_prefix",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_payments_tx",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_storage_stat_in_uploadthing",
            "admin_ticket_admin_badge",
            "admin_upgrade_requests_plan_change",
            "admin_users_role_admin",
            "admin_withdrawals_wallet",
            "aid_hero_title",
            "ambassadors_region_africa",
            "ambassadors_region_asia",
            "ambassadors_region_oceania",
            "auth_email",
            "auth_password",
            "auth_welcome_title",
            "chat_contact_video",
            "chat_offline",
            "creator_studio_title",
            "drawer_section_account",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug",
            "legal_faq",
            "marketplace_hero_title",
            "music_album_detail_eyebrow",
            "music_duration_minutes",
            "music_shell_studio_label",
            "music_title",
            "nav_creator_studio",
            "nav_home",
            "nav_marketplace",
            "news_title",
            "onboarding_bio",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_type_freelance",
            "opportunity_type_hackathon",
            "opportunity_type_partnership",
            "play_hero_title",
            "play_xp",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "pricing_support_247",
            "pricing_support_standard",
            "profile_media",
            "profile_trust_passport_title",
            "reaction_emoji_label",
            "report_reason_spam",
            "settings_account",
            "settings_bio",
            "shorts_repost",
            "stories_video",
            "support_category_account",
            "support_category_bug",
            "support_category_privacy",
            "team_col_email",
            "team_role_admin",
            "team_role_editor",
            "trust_category_community",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "sq" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_news_feedback_prefix",
            "admin_news_network_pilot",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_payments_tx",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_ticket_admin_badge",
            "admin_upgrade_requests_plan_change",
            "admin_users_role_moderator",
            "aid_hero_title",
            "auth_email",
            "auth_welcome_title",
            "chat_contact_video",
            "createpost_media_count_cd",
            "journalist_dash_portfolio_placeholder",
            "journalist_dash_status_draft",
            "journalist_editor_slug",
            "marketplace_hero_title",
            "marketplace_status_draft",
            "music_album_detail_eyebrow",
            "music_duration_minutes",
            "music_title",
            "nav_admin",
            "nav_marketplace",
            "news_title",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_type_freelance",
            "opportunity_type_hackathon",
            "play_hero_title",
            "play_scope_global",
            "play_xp",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "pricing_support_247",
            "profile_media",
            "profile_trust_passport_title",
            "reaction_emoji_label",
            "report_reason_spam",
            "stories_video",
            "team_col_email",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "es" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_nav_label",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_payments_tx",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_support_stat_total",
            "admin_ticket_admin_badge",
            "admin_ticket_plan",
            "admin_upgrade_requests_plan_change",
            "admin_users_admins",
            "admin_users_role_admin",
            "admin_users_total",
            "aid_hero_title",
            "ambassadors_region_asia",
            "api_keys_err_title",
            "auth_welcome_title",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug",
            "legal_section_title",
            "marketplace_hero_title",
            "music_duration_minutes",
            "music_playlists_title",
            "music_title",
            "nav_admin",
            "nav_marketplace",
            "news_title",
            "notification_channel_general_name",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_type_freelance",
            "opportunity_type_hackathon",
            "play_hero_title",
            "play_scope_global",
            "play_type_trivia",
            "play_xp",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "pricing_support_247",
            "profile_trust_passport_title",
            "reaction_emoji_label",
            "report_reason_spam",
            "settings_group_legal",
            "stories_video",
            "support_category_general",
            "support_detail_priority_normal",
            "team_role_admin",
            "team_role_editor",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "ru" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_upgrade_requests_plan_change",
            "aid_hero_title",
            "journalist_dash_portfolio_placeholder",
            "marketplace_hero_title",
            "music_title",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "play_hero_title",
            "play_xp",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "pricing_support_247",
            "profile_trust_passport_title",
            "team_email_placeholder",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "ar" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_upgrade_requests_plan_change",
            "aid_hero_title",
            "journalist_dash_portfolio_placeholder",
            "marketplace_hero_title",
            "music_title",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "play_hero_title",
            "play_xp",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "profile_trust_passport_title",
            "team_email_placeholder",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "zh" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_news_network_publication_meta",
            "admin_news_url_placeholder",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_upgrade_requests_plan_change",
            "aid_hero_title",
            "journalist_dash_portfolio_placeholder",
            "marketplace_hero_title",
            "music_title",
            "nav_ai",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "play_hero_title",
            "play_xp",
            "profile_trust_passport_title",
            "team_email_placeholder",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "tr" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_news_network_pilot",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_ticket_plan",
            "admin_upgrade_requests_plan_change",
            "aid_hero_title",
            "auth_welcome_title",
            "chat_contact_video",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug",
            "journalist_editor_slug_placeholder",
            "marketplace_hero_title",
            "music_title",
            "news_title",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_type_hackathon",
            "play_hero_title",
            "play_vs",
            "play_xp",
            "pricing_plan_pro",
            "profile_trust_passport_title",
            "reaction_emoji_label",
            "report_reason_spam",
            "stories_video",
            "support_detail_priority_normal",
            "team_email_placeholder",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "id" to setOf(
            "action_edit",
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_audit_target",
            "admin_nav_label",
            "admin_news_network_pilot",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_payments_tx",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_support_stat_total",
            "admin_ticket_admin_badge",
            "admin_ticket_status_field",
            "admin_upgrade_requests_plan_change",
            "admin_users_col_status",
            "admin_users_role_admin",
            "admin_users_role_moderator",
            "admin_users_total",
            "aid_hero_title",
            "ambassadors_region_asia",
            "auth_email",
            "auth_welcome_title",
            "chat_contact_video",
            "chat_offline",
            "createpost_media_count_cd",
            "journalist_dash_edit",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug",
            "journalist_editor_slug_placeholder",
            "legal_faq",
            "legal_section_title",
            "marketplace_edit",
            "marketplace_hero_title",
            "music_album_detail_eyebrow",
            "music_shell_genre_placeholder",
            "music_shell_studio_label",
            "music_title",
            "nav_admin",
            "nav_marketplace",
            "news_title",
            "onboarding_bio",
            "onboarding_website_placeholder",
            "opportunity_edit_listing",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_type_freelance",
            "opportunity_type_hackathon",
            "opportunity_type_sponsorship",
            "play_hero_title",
            "play_level",
            "play_scope_global",
            "play_vs",
            "play_xp",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "pricing_support_247",
            "profile_media",
            "profile_trust_passport_title",
            "reaction_emoji_label",
            "report_reason_spam",
            "settings_bio",
            "settings_group_legal",
            "stories_video",
            "support_category_bug",
            "support_detail_priority_normal",
            "support_detail_status_label",
            "team_col_email",
            "team_email_placeholder",
            "team_role_admin",
            "team_role_editor",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "pt" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_nav_label",
            "admin_news_feedback_prefix",
            "admin_news_network_publication_meta",
            "admin_news_network_tab_feeds",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_payments_tx",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_support_stat_total",
            "admin_upgrade_requests_plan_change",
            "admin_users_total",
            "aid_hero_title",
            "auth_welcome_title",
            "chat_offline",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug",
            "legal_section_title",
            "marketplace_hero_title",
            "music_artist_detail_singles_heading",
            "music_duration_minutes",
            "nav_ai",
            "news_title",
            "onboarding_website",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "opportunity_type_freelance",
            "opportunity_type_hackathon",
            "play_hero_title",
            "play_scope_global",
            "play_type_trivia",
            "play_vs",
            "play_xp",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "pricing_support_247",
            "reaction_emoji_label",
            "report_reason_spam",
            "settings_group_legal",
            "settings_website",
            "support_detail_priority_normal",
            "team_col_email",
            "team_email_placeholder",
            "team_role_editor",
            "transparency_days_value",
            "transparency_hours_value",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "ja" to setOf(
            "admin_analytics_post_counts",
            "admin_news_url_placeholder",
            "admin_plan_business",
            "admin_plan_enterprise",
            "admin_plan_pro",
            "admin_upgrade_requests_plan_change",
            "ai_chat_powered_by_deepseek",
            "aid_hero_title",
            "auth_welcome_title",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug_placeholder",
            "marketplace_hero_title",
            "music_shell_studio_label",
            "nav_ai",
            "news_title",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "play_hero_title",
            "play_vs",
            "play_xp",
            "pricing_plan_business",
            "pricing_plan_enterprise",
            "pricing_plan_pro",
            "profile_trust_passport_title",
            "team_email_placeholder",
            "trust_category_zrp",
            "trust_header_title",
            "trust_out_of_100",
        ),
        "ko" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_upgrade_requests_plan_change",
            "auth_welcome_title",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug_placeholder",
            "nav_ai",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "play_xp",
            "team_email_placeholder",
            "trust_category_zrp",
            "trust_out_of_100",
        ),
        "hi" to setOf(
            "admin_analytics_daily_range",
            "admin_analytics_post_counts",
            "admin_news_network_publication_meta",
            "admin_news_network_verify_failed",
            "admin_news_url_placeholder",
            "admin_upgrade_requests_plan_change",
            "aid_hero_title",
            "auth_welcome_title",
            "journalist_dash_portfolio_placeholder",
            "journalist_editor_slug_placeholder",
            "marketplace_hero_title",
            "nav_ai",
            "news_title",
            "onboarding_website_placeholder",
            "opportunity_external_url_placeholder",
            "opportunity_hero_title",
            "play_hero_title",
            "play_xp",
            "pricing_support_247",
            "profile_trust_passport_title",
            "team_email_placeholder",
            "trust_category_zrp",
            "trust_header_title",
            "trust_out_of_100",
        ),
    )

    private val englishResources by lazy { parseStringsXml(File(resDir, "values/strings.xml")) }

    /** app_name (the app's own display name) is deliberately never overridden per-language. */
    private val englishStringsComparable by lazy { englishResources.strings.filterKeys { it != "app_name" } }

    @Test
    fun `every language directory exists`() {
        for (lang in languages) {
            val file = File(resDir, "values-$lang/strings.xml")
            assertTrue("values-$lang/strings.xml is missing", file.exists())
        }
    }

    @Test
    fun `every language has exactly the same key set as English - no missing, no extra`() {
        val englishKeys = englishStringsComparable.keys
        val failures = mutableListOf<String>()
        for (lang in languages) {
            val resources = parseStringsXml(File(resDir, "values-$lang/strings.xml"))
            val missing = englishKeys - resources.strings.keys
            val extra = resources.strings.keys - englishKeys
            if (missing.isNotEmpty()) failures += "$lang is missing keys: ${missing.take(20)}"
            if (extra.isNotEmpty()) failures += "$lang has extra keys not in English: ${extra.take(20)}"

            val missingPlurals = englishResources.plurals.keys - resources.plurals.keys
            if (missingPlurals.isNotEmpty()) failures += "$lang is missing plurals: $missingPlurals"
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun `no translation value is an empty string`() {
        val failures = mutableListOf<String>()
        for (lang in languages) {
            val resources = parseStringsXml(File(resDir, "values-$lang/strings.xml"))
            val empties = resources.strings.filterValues { it.isBlank() }.keys
            if (empties.isNotEmpty()) failures += "$lang has empty values for: ${empties.take(20)}"
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun `no translation value is a raw unresolved resource name`() {
        val failures = mutableListOf<String>()
        for (lang in languages) {
            val resources = parseStringsXml(File(resDir, "values-$lang/strings.xml"))
            val leaked = resources.strings.filter { (k, v) -> v == k }.keys
            if (leaked.isNotEmpty()) failures += "$lang exposes raw resource names as values: $leaked"
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun `no non-English value is an un-reviewed byte-for-byte copy of the English source`() {
        val failures = mutableListOf<String>()
        for (lang in languages) {
            val resources = parseStringsXml(File(resDir, "values-$lang/strings.xml"))
            val allowlist = perLanguageAllowlist[lang] ?: emptySet()
            val unreviewedCopies = englishStringsComparable.filter { (key, enValue) ->
                val value = resources.strings[key]
                value == enValue && enValue !in universalAllowlist && key !in allowlist
            }.keys
            if (unreviewedCopies.isNotEmpty()) {
                failures += "$lang has ${unreviewedCopies.size} untranslated (English-copy) value(s) " +
                    "not in the reviewed exceptions list: ${unreviewedCopies.take(20)}"
            }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun `every format placeholder in English exists in every other language's value for the same key`() {
        val failures = mutableListOf<String>()
        for (lang in languages) {
            val resources = parseStringsXml(File(resDir, "values-$lang/strings.xml"))
            val mismatches = mutableListOf<String>()
            for ((key, enValue) in englishStringsComparable) {
                val enTokens = placeholderRegex.findAll(enValue).map { it.value }.toSet() - optionalTokens
                if (enTokens.isEmpty()) continue
                val value = resources.strings[key] ?: continue
                val valueTokens = placeholderRegex.findAll(value).map { it.value }.toSet()
                val missing = enTokens - valueTokens
                if (missing.isNotEmpty()) mismatches += "$key (missing $missing)"
            }
            if (mismatches.isNotEmpty()) {
                failures += "$lang has placeholder mismatches: ${mismatches.take(20)}"
            }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun `every plurals quantity item preserves English's format placeholders`() {
        val failures = mutableListOf<String>()
        for (lang in languages) {
            val resources = parseStringsXml(File(resDir, "values-$lang/strings.xml"))
            for ((pluralName, enItems) in englishResources.plurals) {
                val langItems = resources.plurals[pluralName] ?: continue
                for ((quantity, enValue) in enItems) {
                    val value = langItems[quantity] ?: continue
                    val enTokens = placeholderRegex.findAll(enValue).map { it.value }.toSet()
                    val valueTokens = placeholderRegex.findAll(value).map { it.value }.toSet()
                    if (enTokens != valueTokens) {
                        failures += "$lang plurals/$pluralName[$quantity]: expected $enTokens, got $valueTokens"
                    }
                }
            }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }
}
