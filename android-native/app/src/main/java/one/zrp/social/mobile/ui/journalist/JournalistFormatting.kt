package one.zrp.social.mobile.ui.journalist

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R

/** Ported from journalist/page.tsx's own STATUS_LABEL_KEYS - the 5 real NewsArticle statuses a journalist's own article list can show. */
@Composable
fun journalistArticleStatusLabel(status: String): String = when (status) {
    "DRAFT" -> stringResource(R.string.journalist_dash_status_draft)
    "PENDING_REVIEW" -> stringResource(R.string.journalist_dash_stat_pending_review)
    "PUBLISHED" -> stringResource(R.string.journalist_dash_stat_published)
    "REJECTED" -> stringResource(R.string.journalist_dash_stat_rejected)
    "ARCHIVED" -> stringResource(R.string.journalist_dash_status_archived)
    else -> status
}

/** Ported from journalist/page.tsx's own STATUS_STYLES text colors. */
fun journalistArticleStatusColor(status: String): Color = when (status) {
    "DRAFT" -> Color(0xFFA16207)
    "PENDING_REVIEW" -> Color(0xFF1D4ED8)
    "PUBLISHED" -> Color(0xFF15803D)
    "REJECTED" -> Color(0xFFB91C1C)
    else -> Color(0xFF6B7280)
}

/** Ported from ArticleEditorForm.tsx's own lockedStatusLabel branch (PENDING_REVIEW/PUBLISHED/else=ARCHIVED). */
@Composable
fun journalistLockedStatusLabel(status: String): String = when (status) {
    "PENDING_REVIEW" -> stringResource(R.string.journalist_editor_status_pending_review)
    "PUBLISHED" -> stringResource(R.string.journalist_editor_status_published)
    else -> stringResource(R.string.journalist_editor_status_archived)
}
