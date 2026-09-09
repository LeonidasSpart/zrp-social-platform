package one.zrp.social.mobile.ui.admin

import android.content.ContentResolver
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminNewsArticle
import one.zrp.social.mobile.network.NEWS_CATEGORIES
import one.zrp.social.mobile.ui.journalist.journalistArticleStatusColor
import one.zrp.social.mobile.ui.journalist.journalistArticleStatusLabel
import one.zrp.social.mobile.ui.news.newsCategoryLabel
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The native ZRP News editorial desk - ported from
 * src/app/admin/news/page.tsx. See AdminNewsViewModel's own KDoc for
 * what the two halves of this screen are and why it is staff-wide
 * rather than ADMIN-only.
 *
 * The editor is a full-screen body on this same screen rather than its
 * own nav destination, mirroring the website's own modal-on-the-page
 * layout: it keeps the list and the form on one ViewModel, so a save
 * reloads exactly the page, filters and search the editor came from,
 * and a system back press closes the form instead of leaving the desk
 * (see the BackHandler below).
 *
 * onViewArticle opens the real native article screen, never a browser.
 */
@Composable
fun AdminNewsScreen(onBack: () -> Unit, onViewArticle: (String) -> Unit) {
    val viewModel: AdminNewsViewModel = viewModel(
        factory = remember { AdminNewsViewModelFactory(AdminRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) { viewModel.load(1) }

    LaunchedEffect(state.error) {
        val message = state.error
        if (message != null) {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            viewModel.consumeError()
        }
    }

    val message = state.message
    val messageText = if (message != null) adminNewsMessageText(message) else null
    LaunchedEffect(message) {
        if (messageText != null) {
            Toast.makeText(context, messageText, Toast.LENGTH_SHORT).show()
            viewModel.consumeMessage()
        }
    }

    val editor = state.editor
    if (editor != null) {
        BackHandler(enabled = !state.isSaving) { viewModel.closeEditor() }
        AdminNewsEditorBody(
            editor = editor,
            isSaving = state.isSaving,
            formError = state.formError,
            onClose = { viewModel.closeEditor() },
            viewModel = viewModel,
        )
    } else {
        AdminNewsListBody(
            state = state,
            viewModel = viewModel,
            onBack = onBack,
            onViewArticle = onViewArticle,
        )
    }

    val pendingDelete = state.confirmDelete
    if (pendingDelete != null) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelDelete() },
            title = { Text(stringResource(R.string.admin_news_delete_article_title)) },
            text = { Text(stringResource(R.string.admin_news_confirm_delete, pendingDelete.title)) },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmDelete() }) {
                    Text(stringResource(R.string.admin_reports_confirm_action), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelDelete() }) {
                    Text(stringResource(R.string.admin_reports_cancel))
                }
            },
        )
    }

    if (state.rejectArticleId != null) {
        // The website collects this with a window.prompt whose Cancel
        // aborts the whole reject and whose empty OK still rejects - the
        // dialog below behaves the same way.
        var note by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { viewModel.cancelReject() },
            title = { Text(stringResource(R.string.admin_news_reject_title)) },
            text = {
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text(stringResource(R.string.admin_news_prompt_reject_feedback)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmReject(note) }) {
                    Text(stringResource(R.string.admin_review_reject), color = ZrpRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelReject() }) {
                    Text(stringResource(R.string.admin_reports_cancel))
                }
            },
        )
    }
}

@Composable
private fun adminNewsMessageText(message: AdminNewsMessage): String = when (message) {
    AdminNewsMessage.CREATED -> stringResource(R.string.admin_news_success_created)
    AdminNewsMessage.UPDATED -> stringResource(R.string.admin_news_success_updated)
    AdminNewsMessage.DELETED -> stringResource(R.string.admin_news_success_deleted)
    AdminNewsMessage.APPROVED -> stringResource(R.string.admin_news_success_approved_published)
    AdminNewsMessage.SENT_BACK -> stringResource(R.string.admin_news_success_sent_back)
}

@Composable
private fun adminNewsFormErrorText(error: AdminNewsFormError): String = when (error) {
    AdminNewsFormError.TITLE -> stringResource(R.string.journalist_editor_err_title_required)
    AdminNewsFormError.SLUG -> stringResource(R.string.journalist_editor_err_slug_required)
    AdminNewsFormError.CONTENT -> stringResource(R.string.admin_news_err_content_required)
    AdminNewsFormError.AUTHOR_ID -> stringResource(R.string.admin_news_err_author_id_required)
}

@Composable
private fun newsStatusFilterLabel(status: String): String =
    if (status.isEmpty()) stringResource(R.string.admin_news_all_statuses) else journalistArticleStatusLabel(status)

@Composable
private fun newsCategoryFilterLabel(category: String): String =
    if (category.isEmpty()) stringResource(R.string.admin_news_all_categories) else newsCategoryLabel(category)

// ─── List ────────────────────────────────────────────────────────────

@Composable
private fun AdminNewsListBody(
    state: AdminNewsUiState,
    viewModel: AdminNewsViewModel,
    onBack: () -> Unit,
    onViewArticle: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Column(modifier = Modifier.weight(1f).padding(start = 4.dp)) {
                Text(
                    text = stringResource(R.string.news_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.admin_news_subtitle),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = { viewModel.openCreate() }) {
                Icon(
                    Icons.Filled.Add,
                    contentDescription = stringResource(R.string.admin_news_new_article),
                    tint = ZrpRed,
                )
            }
        }

        NewsStatsRow(state = state)

        OutlinedTextField(
            value = state.search,
            onValueChange = { viewModel.setSearch(it) },
            placeholder = { Text(stringResource(R.string.admin_news_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { viewModel.submitSearch() }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            (listOf("") + NEWS_STATUSES).forEach { status ->
                FilterChip(
                    selected = state.statusFilter == status,
                    onClick = { viewModel.setStatusFilter(status) },
                    label = { Text(newsStatusFilterLabel(status)) },
                )
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            (listOf("") + NEWS_CATEGORIES).forEach { category ->
                FilterChip(
                    selected = state.categoryFilter == category,
                    onClick = { viewModel.setCategoryFilter(category) },
                    label = { Text(newsCategoryFilterLabel(category)) },
                )
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.articles.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(R.string.admin_news_no_articles_found),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = stringResource(R.string.admin_news_create_first_article),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Button(onClick = { viewModel.openCreate() }, modifier = Modifier.padding(top = Spacing.lg)) {
                    Text(stringResource(R.string.admin_news_create_article_button))
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(Spacing.lg),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(state.articles, key = { it.id }) { article ->
                    AdminNewsRow(
                        article = article,
                        isBusy = state.busyArticleId == article.id,
                        onApprove = { viewModel.approve(article) },
                        onReject = { viewModel.requestReject(article.id) },
                        onView = { onViewArticle(article.slug) },
                        onEdit = { viewModel.openEdit(article) },
                        onDelete = { viewModel.requestDelete(article) },
                    )
                }
            }

            if (state.totalPages > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { viewModel.setPage(state.page - 1) }, enabled = state.page > 1) {
                        Text(stringResource(R.string.admin_reports_previous))
                    }
                    Text(
                        text = stringResource(R.string.admin_reports_page_of, state.page, state.totalPages),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    TextButton(
                        onClick = { viewModel.setPage(state.page + 1) },
                        enabled = state.page < state.totalPages,
                    ) {
                        Text(stringResource(R.string.admin_reports_next))
                    }
                }
            }
        }
    }
}

@Composable
private fun NewsStatsRow(state: AdminNewsUiState) {
    val cards = listOf(
        stringResource(R.string.admin_news_stat_total_articles) to state.total,
        stringResource(R.string.admin_news_stat_published_on_page) to state.publishedOnPage,
        stringResource(R.string.admin_news_stat_drafts_on_page) to state.draftsOnPage,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        cards.forEach { (label, value) ->
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerLow)
                    .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            ) {
                Text(
                    text = value.toString(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = ZrpRed,
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AdminNewsRow(
    article: AdminNewsArticle,
    isBusy: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onView: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(Spacing.md),
    ) {
        Row {
            // The website's own thumbnail: the cover if there is one,
            // otherwise a red ZRP block.
            Box(
                modifier = Modifier
                    .width(80.dp)
                    .height(56.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (article.coverImage.isNullOrBlank()) ZrpRed else MaterialTheme.colorScheme.surfaceContainerHigh),
                contentAlignment = Alignment.Center,
            ) {
                if (!article.coverImage.isNullOrBlank()) {
                    AsyncImage(
                        model = article.coverImage,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Text(
                        text = "ZRP",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                    )
                }
            }

            Column(modifier = Modifier.weight(1f).padding(start = Spacing.md)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (article.featured) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = stringResource(R.string.admin_news_featured_title),
                            tint = ZrpRed,
                            modifier = Modifier.size(16.dp).padding(end = 4.dp),
                        )
                    }
                    Text(
                        text = article.title,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = "/news/${article.slug}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Text(
                    text = stringResource(
                        R.string.admin_news_by_author,
                        article.author.name ?: "@${article.author.username}",
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Row(
            modifier = Modifier.padding(top = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Text(
                text = journalistArticleStatusLabel(article.status),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = journalistArticleStatusColor(article.status),
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(journalistArticleStatusColor(article.status).copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
            Text(
                text = newsCategoryLabel(article.category),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(ZrpRed.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }

        if (article.status == "REJECTED" && !article.reviewNote.isNullOrBlank()) {
            Text(
                text = stringResource(R.string.admin_news_feedback_prefix, article.reviewNote),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        // The website shows the publish date, falling back to the
        // creation date for anything not published yet.
        val dateMillis = parseNewsInstant(article.publishedAt) ?: parseNewsInstant(article.createdAt)
        val dateText = if (dateMillis != null) {
            formatAdminNewsDateTime(dateMillis)
        } else {
            stringResource(R.string.admin_news_not_published)
        }
        Text(
            text = stringResource(R.string.news_views_count, article.views.toString()) + " · " + dateText,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )

        if (isBusy) {
            CircularProgressIndicator(
                modifier = Modifier.padding(top = Spacing.sm).size(20.dp),
                strokeWidth = 2.dp,
            )
        } else {
            Row(
                modifier = Modifier.padding(top = Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Approve/reject only exist for a journalist submission
                // still awaiting review - the same rows the website
                // offers them on.
                if (article.status == "PENDING_REVIEW") {
                    TextButton(onClick = onApprove) {
                        Text(stringResource(R.string.admin_news_approve_title))
                    }
                    TextButton(onClick = onReject) {
                        Text(stringResource(R.string.admin_review_reject), color = ZrpRed)
                    }
                }
                Box(modifier = Modifier.weight(1f))
                // The public article route only ever serves a PUBLISHED
                // article, so viewing anything else would land on a
                // "not found" - the action is offered where it works.
                if (article.status == "PUBLISHED") {
                    IconButton(onClick = onView) {
                        Icon(
                            Icons.Filled.Visibility,
                            contentDescription = stringResource(R.string.admin_news_view_article_title),
                        )
                    }
                }
                IconButton(onClick = onEdit) {
                    Icon(
                        Icons.Filled.Edit,
                        contentDescription = stringResource(R.string.admin_news_edit_article_title),
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = stringResource(R.string.admin_news_delete_article_title),
                        tint = ZrpRed,
                    )
                }
            }
        }
    }
}

// ─── Editor ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AdminNewsEditorBody(
    editor: AdminNewsEditorState,
    isSaving: Boolean,
    formError: AdminNewsFormError?,
    onClose: () -> Unit,
    viewModel: AdminNewsViewModel,
) {
    val contentResolver = LocalContext.current.contentResolver
    val coverPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryNewsCoverNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/*"
            viewModel.onCoverImagePicked(contentResolver, uri, name, mimeType, size)
        }
    }

    var showDatePicker by remember { mutableStateOf(false) }
    var pendingDayMillis by remember { mutableStateOf<Long?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose, enabled = !isSaving) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.admin_reports_cancel))
            }
            Column(modifier = Modifier.weight(1f).padding(start = 4.dp)) {
                Text(
                    text = stringResource(
                        if (editor.articleId == null) {
                            R.string.admin_news_create_title
                        } else {
                            R.string.admin_news_edit_title
                        },
                    ),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (editor.articleId == null) {
                        stringResource(R.string.admin_news_publish_new_desc)
                    } else {
                        stringResource(R.string.admin_news_editing_slug, editor.editingSlug)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        HorizontalDivider()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg),
        ) {
            if (formError != null) {
                Text(
                    text = adminNewsFormErrorText(formError),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = Spacing.sm),
                )
            }

            OutlinedTextField(
                value = editor.title,
                onValueChange = viewModel::onTitleChange,
                label = { Text(stringResource(R.string.journalist_editor_title)) },
                placeholder = { Text(stringResource(R.string.journalist_editor_title_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = editor.slug,
                onValueChange = viewModel::onSlugChange,
                label = { Text(stringResource(R.string.journalist_editor_slug)) },
                placeholder = { Text(stringResource(R.string.journalist_editor_slug_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )

            NewsEnumDropdown(
                label = stringResource(R.string.journalist_editor_category),
                value = editor.category,
                options = NEWS_CATEGORIES,
                optionLabel = { newsCategoryLabel(it) },
                onSelect = viewModel::onCategoryChange,
            )

            NewsEnumDropdown(
                label = stringResource(R.string.admin_ticket_status_field),
                value = editor.status,
                options = NEWS_STATUSES,
                optionLabel = { journalistArticleStatusLabel(it) },
                onSelect = viewModel::onStatusChange,
            )

            OutlinedTextField(
                value = editor.excerpt,
                onValueChange = viewModel::onExcerptChange,
                label = { Text(stringResource(R.string.journalist_editor_excerpt)) },
                placeholder = { Text(stringResource(R.string.journalist_editor_excerpt_placeholder)) },
                minLines = 2,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )

            // Plain text, exactly like the website's own <textarea>: a
            // ZRP News body is stored and rendered as plain text with
            // paragraph breaks, so there is no rich-text or markdown
            // toolbar to port.
            OutlinedTextField(
                value = editor.content,
                onValueChange = viewModel::onContentChange,
                label = { Text(stringResource(R.string.journalist_editor_content)) },
                placeholder = { Text(stringResource(R.string.journalist_editor_content_placeholder)) },
                minLines = 10,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )

            Text(
                text = stringResource(R.string.journalist_editor_cover_image),
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(top = Spacing.lg),
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                Box(
                    modifier = Modifier
                        .width(120.dp)
                        .height(78.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                    contentAlignment = Alignment.Center,
                ) {
                    if (editor.coverImage.isNotBlank()) {
                        AsyncImage(
                            model = editor.coverImage,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Icon(
                            Icons.Filled.Image,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                OutlinedButton(
                    onClick = {
                        coverPickerLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    enabled = !editor.uploadingCover,
                    modifier = Modifier.padding(start = Spacing.md),
                ) {
                    if (editor.uploadingCover) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Text(
                            stringResource(R.string.journalist_editor_uploading),
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    } else {
                        Text(stringResource(R.string.journalist_editor_upload_image))
                    }
                }
            }
            val coverError = editor.coverUploadErrorDetail
            if (coverError != null) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    Text(
                        text = stringResource(R.string.journalist_editor_err_cover_upload_failed, coverError),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { viewModel.dismissCoverUploadError() }) {
                        Text(stringResource(R.string.action_clear))
                    }
                }
            }

            // The url the article is actually saved with - typed by hand
            // for a syndicated image, or filled in by the upload above.
            OutlinedTextField(
                value = editor.coverImage,
                onValueChange = viewModel::onCoverImageChange,
                label = { Text(stringResource(R.string.admin_news_cover_image_url_label)) },
                placeholder = { Text(stringResource(R.string.admin_news_url_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )

            OutlinedTextField(
                value = editor.sourceName,
                onValueChange = viewModel::onSourceNameChange,
                label = { Text(stringResource(R.string.journalist_editor_source_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )
            OutlinedTextField(
                value = editor.sourceUrl,
                onValueChange = viewModel::onSourceUrlChange,
                label = { Text(stringResource(R.string.journalist_editor_source_url)) },
                placeholder = { Text(stringResource(R.string.admin_news_url_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )

            OutlinedTextField(
                value = editor.authorId,
                onValueChange = viewModel::onAuthorIdChange,
                label = { Text(stringResource(R.string.admin_news_author_id_label)) },
                placeholder = { Text(stringResource(R.string.admin_news_author_id_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.md),
            )
            Text(
                text = stringResource(R.string.admin_news_author_id_hint),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )

            Text(
                text = stringResource(R.string.admin_news_published_at_label),
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(top = Spacing.lg),
            )
            val publishedAtMillis = editor.publishedAtMillis
            val publishedAtText = if (publishedAtMillis != null) {
                formatAdminNewsDateTime(publishedAtMillis)
            } else {
                stringResource(R.string.admin_news_not_published)
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                OutlinedButton(onClick = { showDatePicker = true }) {
                    Icon(Icons.Filled.Schedule, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(text = publishedAtText, modifier = Modifier.padding(start = 6.dp))
                }
                if (editor.publishedAtMillis != null) {
                    TextButton(
                        onClick = { viewModel.clearPublishedAt() },
                        modifier = Modifier.padding(start = Spacing.sm),
                    ) {
                        Text(stringResource(R.string.action_clear))
                    }
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
            ) {
                Checkbox(checked = editor.featured, onCheckedChange = viewModel::onFeaturedChange)
                Column(modifier = Modifier.padding(start = Spacing.sm)) {
                    Text(
                        text = stringResource(R.string.admin_news_featured_title),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = stringResource(R.string.admin_news_featured_desc),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = Spacing.xl),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            ) {
                OutlinedButton(onClick = onClose, enabled = !isSaving, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.admin_reports_cancel))
                }
                Button(
                    onClick = { viewModel.save() },
                    enabled = !isSaving && !editor.uploadingCover,
                    modifier = Modifier.weight(1f),
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Text(stringResource(R.string.admin_news_saving), modifier = Modifier.padding(start = 6.dp))
                    } else {
                        Text(
                            stringResource(
                                if (editor.articleId == null) {
                                    R.string.admin_news_create_article_button
                                } else {
                                    R.string.admin_news_update_article
                                },
                            ),
                        )
                    }
                }
            }
        }
    }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = editor.publishedAtMillis?.let { newsUtcDayMillis(it) },
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    val millis = datePickerState.selectedDateMillis
                    showDatePicker = false
                    // Picking a day only opens the time step: the
                    // website's own datetime-local input carries a
                    // minute, so a native date-only pick would silently
                    // drop scheduling precision it already has.
                    if (millis != null) pendingDayMillis = millis
                }) {
                    Text(stringResource(android.R.string.ok))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    val dayMillis = pendingDayMillis
    if (dayMillis != null) {
        val (initialHour, initialMinute) = editor.publishedAtMillis?.let { newsLocalHourMinute(it) } ?: (9 to 0)
        val timePickerState = rememberTimePickerState(
            initialHour = initialHour,
            initialMinute = initialMinute,
            is24Hour = true,
        )
        AlertDialog(
            onDismissRequest = { pendingDayMillis = null },
            title = { Text(stringResource(R.string.admin_news_published_at_label)) },
            text = { TimePicker(state = timePickerState) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.setPublishedAt(dayMillis, timePickerState.hour, timePickerState.minute)
                    pendingDayMillis = null
                }) {
                    Text(stringResource(android.R.string.ok))
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDayMillis = null }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewsEnumDropdown(
    label: String,
    value: String,
    options: List<String>,
    optionLabel: @Composable (String) -> String,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.padding(top = Spacing.md),
    )
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.padding(top = 4.dp),
    ) {
        OutlinedTextField(
            value = optionLabel(value),
            onValueChange = {},
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(optionLabel(option)) },
                    onClick = {
                        onSelect(option)
                        expanded = false
                    },
                )
            }
        }
    }
}

private fun queryNewsCoverNameAndSize(contentResolver: ContentResolver, uri: Uri): Pair<String, Long> {
    var name = "cover"
    var size = 0L
    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
        if (cursor.moveToFirst()) {
            if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
            if (sizeIndex >= 0) size = cursor.getLong(sizeIndex)
        }
    }
    return name to size
}
