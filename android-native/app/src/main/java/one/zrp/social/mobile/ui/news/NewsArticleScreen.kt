package one.zrp.social.mobile.ui.news

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.NewsRepository
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount

/** ZRP News article - ported from news/[slug]/page.tsx. */
@Composable
fun NewsArticleScreen(slug: String, onBack: () -> Unit, onOpenNewsList: () -> Unit = onBack) {
    val viewModel: NewsArticleViewModel = viewModel(
        factory = remember { NewsArticleViewModelFactory(slug, NewsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.news_back_to_list))
            }
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notFound || state.article == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(R.string.news_err_failed_load),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
            else -> {
                val article = state.article!!
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = newsCategoryLabel(article.category),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(ZrpRed)
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                        if (article.featured) {
                            Text(
                                text = stringResource(R.string.news_featured),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = ZrpRed,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(ZrpRed.copy(alpha = 0.1f))
                                    .padding(horizontal = 10.dp, vertical = 4.dp),
                            )
                        }
                    }

                    Text(
                        text = article.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 12.dp),
                    )

                    if (!article.excerpt.isNullOrBlank()) {
                        Text(
                            text = article.excerpt,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 10.dp),
                        )
                    }

                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 16.dp)) {
                        Avatar(url = article.author.avatarUrl, name = article.author.username, size = 36.dp)
                        Column(modifier = Modifier.padding(start = 8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = article.author.name ?: article.author.username,
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false),
                                )
                                VerifiedBadge(badgeType = article.author.badgeType)
                            }
                            Text(
                                text = "@${article.author.username}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    Text(
                        text = formatNewsDetailDateTime(article.publishedAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        text = stringResource(R.string.news_views_count, formatCount(article.views)),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )

                    if (article.coverImage != null) {
                        AsyncImage(
                            model = article.coverImage,
                            contentDescription = article.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 320.dp)
                                .padding(top = 16.dp)
                                .clip(RoundedCornerShape(16.dp)),
                        )
                    }

                    if (article.sourceName != null) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 16.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                                .padding(14.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.news_source),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            val sourceUrl = article.sourceUrl
                            Text(
                                text = article.sourceName,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                                color = if (sourceUrl != null) ZrpRed else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier
                                    .padding(top = 2.dp)
                                    .let { m ->
                                        if (sourceUrl != null) {
                                            m.clickable { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(sourceUrl))) }
                                        } else {
                                            m
                                        }
                                    },
                            )
                        }
                    }

                    Column(modifier = Modifier.padding(top = 20.dp, bottom = 24.dp)) {
                        article.content.split(Regex("\n{2,}")).forEach { paragraph ->
                            if (paragraph.isNotBlank()) {
                                Text(
                                    text = paragraph.trim(),
                                    style = MaterialTheme.typography.bodyLarge,
                                    modifier = Modifier.padding(bottom = 16.dp),
                                )
                            }
                        }
                    }

                    Text(
                        text = stringResource(R.string.news_more_news),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = ZrpRed,
                        modifier = Modifier
                            .clickable(onClick = onOpenNewsList)
                            .padding(bottom = 32.dp),
                    )
                }
            }
        }
    }
}
