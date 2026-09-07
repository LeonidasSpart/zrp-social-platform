package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.GifsRepository
import one.zrp.social.mobile.network.GifResult
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * The native equivalent of the website's GifPicker.tsx - the same real
 * trending-on-open / search-as-you-confirm flow, backed by the same
 * real, backend-proxied Giphy endpoints (never talking to Giphy
 * directly). "Choose a GIF" / "Search GIFs..." / "No GIFs found" /
 * "Type to search GIFs" / "Loading..." all stay English-only on
 * purpose, matching GifPicker.tsx's own hardcoded, untranslated copy
 * exactly.
 */
@Composable
fun GifPickerDialog(
    onDismiss: () -> Unit,
    onSelect: (GifResult) -> Unit,
) {
    val repository = remember { GifsRepository() }
    val coroutineScope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var gifs by remember { mutableStateOf<List<GifResult>>(emptyList()) }
    var trending by remember { mutableStateOf<List<GifResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        repository.getTrending()
            .onSuccess { trending = it }
            .onFailure { error = it.message }
    }

    fun search() {
        if (query.length < 2) return
        loading = true
        error = null
        coroutineScope.launch {
            repository.search(query)
                .onSuccess { gifs = it }
                .onFailure { error = it.message }
            loading = false
        }
    }

    val displayGifs = if (query.length >= 2) gifs else trending

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.lg)
                .height(500.dp),
            shape = MaterialTheme.shapes.large,
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(Spacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Choose a GIF", style = MaterialTheme.typography.titleMedium)
                    // Hardcoded English, not stringResource - this whole dialog's text
                    // (title, placeholder, loading/error copy) is native-only and not
                    // yet wired into the translation system, so these two accessibility
                    // labels stay consistent with that rather than being translated in
                    // isolation.
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Filled.Close, contentDescription = "Close")
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.md),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Search GIFs...") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { search() }, enabled = query.length >= 2) {
                        Icon(Icons.Filled.Search, contentDescription = "Search")
                    }
                }

                Box(modifier = Modifier.fillMaxSize().padding(Spacing.md)) {
                    when {
                        loading -> Text("Loading...", modifier = Modifier.align(Alignment.Center))
                        error != null -> Text(
                            text = error ?: "",
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.align(Alignment.Center),
                        )
                        displayGifs.isEmpty() -> Text(
                            text = if (query.length >= 2) "No GIFs found" else "Type to search GIFs",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.align(Alignment.Center),
                        )
                        else -> LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            items(displayGifs, key = { it.id }) { gif ->
                                AsyncImage(
                                    model = gif.url,
                                    contentDescription = gif.title,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(120.dp)
                                        .clip(MaterialTheme.shapes.medium)
                                        .clickable { onSelect(gif) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
