package one.zrp.social.mobile.ui.ambassadors

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AmbassadorsRepository
import one.zrp.social.mobile.network.AmbassadorCountry
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

// The same 7 continents REGION_BY_CODE assigns every one of the real
// 250 countries to server-side (src/lib/ambassadors/countries.ts) -
// used only to filter the already-fetched, already-complete list this
// screen receives from GET /api/ambassadors/countries, never to drop a
// country from it. Region keys are the real uppercase ZrpRegion enum
// values the API's own country.region field already returns.
private val REGIONS = listOf(
    "AFRICA", "ASIA", "EUROPE", "NORTH_AMERICA", "SOUTH_AMERICA", "OCEANIA", "ANTARCTICA",
)

@Composable
private fun regionLabel(region: String): String = when (region) {
    "AFRICA" -> stringResource(R.string.ambassadors_region_africa)
    "ASIA" -> stringResource(R.string.ambassadors_region_asia)
    "EUROPE" -> stringResource(R.string.ambassadors_region_europe)
    "NORTH_AMERICA" -> stringResource(R.string.ambassadors_region_north_america)
    "SOUTH_AMERICA" -> stringResource(R.string.ambassadors_region_south_america)
    "OCEANIA" -> stringResource(R.string.ambassadors_region_oceania)
    "ANTARCTICA" -> stringResource(R.string.ambassadors_region_antarctica)
    else -> region
}

/**
 * Renders a flag emoji from an ISO 3166-1 alpha-2 code via Unicode
 * Regional Indicator Symbols - the exact same technique
 * countries.ts's own flagEmoji() uses server-side, so no image asset
 * is needed here either; it inherits the device's own emoji font.
 */
internal fun flagEmoji(code: String): String {
    val upper = code.uppercase()
    if (upper.length != 2) return "🏳️"
    val codePoints = upper.map { 0x1F1E6 - 'A'.code + it.code }
    return codePoints.joinToString(separator = "") { String(Character.toChars(it)) }
}

/**
 * ZRP Global Ambassadors - the public overview, ported from
 * src/components/ambassadors/AmbassadorsExperience.tsx: a real hero
 * with live totals, a Country Explorer over the complete, unfiltered
 * 250-country dataset (search + region filter, no country ever
 * dropped - a 0-ambassador country still appears), and the four real
 * ambassador levels. No interactive SVG world map is rendered here -
 * the website's own accessibility fix for that map (PR #267) already
 * establishes the Explorer as "the real, complete, independently
 * keyboard- and screen-reader-accessible way to reach any of the 250
 * countries," so this screen makes that the ONE primary path rather
 * than duplicating a decorative map render natively.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AmbassadorsScreen(
    onBack: () -> Unit,
    onOpenApply: (countryCode: String?) -> Unit,
    onOpenDashboard: () -> Unit,
) {
    val viewModel: AmbassadorsViewModel = viewModel(
        factory = remember { AmbassadorsViewModelFactory(AmbassadorsRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    var explorerOffset by remember { mutableFloatStateOf(0f) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Text(
                text = stringResource(R.string.ambassadors_nav_label),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).padding(start = 4.dp),
            )
            IconButton(onClick = onOpenDashboard) {
                Icon(
                    Icons.Filled.AccountCircle,
                    contentDescription = stringResource(R.string.ambassadors_dashboard_title),
                )
            }
        }
        HorizontalDivider()

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            Column(modifier = Modifier.fillMaxSize().verticalScroll(scrollState)) {
                HeroSection(
                    totalAmbassadors = state.totalAmbassadors,
                    countriesRepresented = state.countriesRepresented,
                    onApply = { onOpenApply(null) },
                    onExplore = {
                        coroutineScope.launch { scrollState.animateScrollTo(explorerOffset.toInt()) }
                    },
                )

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { explorerOffset = it.positionInParent().y },
                ) {
                    ExplorerSection(state = state, viewModel = viewModel)
                }

                LevelsSection()

                Spacer(modifier = Modifier.height(Spacing.xxl))
            }
        }
    }

    val selected = state.selectedCountry
    if (selected != null) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(
            onDismissRequest = { viewModel.onCountrySelect(null) },
            sheetState = sheetState,
        ) {
            CountryDetailSheet(
                country = selected,
                onBecomeAmbassador = {
                    viewModel.onCountrySelect(null)
                    onOpenApply(selected.code)
                },
                onClose = { viewModel.onCountrySelect(null) },
            )
        }
    }
}

@Composable
private fun HeroSection(
    totalAmbassadors: Int,
    countriesRepresented: Int,
    onApply: () -> Unit,
    onExplore: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(ZrpRed.copy(alpha = 0.10f), MaterialTheme.colorScheme.surface),
                ),
            )
            .padding(horizontal = Spacing.lg, vertical = Spacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            shape = RoundedCornerShape(50),
            color = ZrpRed.copy(alpha = 0.12f),
        ) {
            Text(
                text = stringResource(R.string.ambassadors_hero_badge),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = ZrpRed,
                modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs),
            )
        }

        Text(
            text = stringResource(R.string.ambassadors_hero_title1),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.lg),
        )
        Text(
            text = stringResource(R.string.ambassadors_hero_title2),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
            color = ZrpRed,
        )
        Text(
            text = stringResource(R.string.ambassadors_hero_title3),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
        )

        Text(
            text = stringResource(R.string.ambassadors_hero_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.md),
        )

        Row(
            modifier = Modifier.padding(top = Spacing.xl),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xxl),
        ) {
            HeroStat(value = totalAmbassadors, label = stringResource(R.string.ambassadors_hero_stat_ambassadors))
            HeroStat(value = countriesRepresented, label = stringResource(R.string.ambassadors_hero_stat_countries))
        }

        Button(
            onClick = onApply,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier.padding(top = Spacing.xl).fillMaxWidth(),
        ) {
            Text(stringResource(R.string.ambassadors_hero_cta_primary))
        }
        OutlinedButton(
            onClick = onExplore,
            modifier = Modifier.padding(top = Spacing.sm).fillMaxWidth(),
        ) {
            Text(stringResource(R.string.ambassadors_hero_cta_secondary))
        }
    }
}

@Composable
private fun HeroStat(value: Int, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value.toString(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ExplorerSection(state: AmbassadorsUiState, viewModel: AmbassadorsViewModel) {
    Column(modifier = Modifier.padding(top = Spacing.xxl)) {
        Text(
            text = stringResource(R.string.ambassadors_explorer_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
        )
        Text(
            text = stringResource(R.string.ambassadors_explorer_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.xs),
        )

        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = { viewModel.onSearchQueryChange(it) },
            placeholder = { Text(stringResource(R.string.ambassadors_explorer_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (state.searchQuery.isNotEmpty()) {
                    IconButton(onClick = { viewModel.onSearchQueryChange("") }) {
                        Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.action_clear))
                    }
                }
            },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg, vertical = Spacing.md),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = Spacing.lg),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            FilterChip(
                selected = state.selectedRegion == null,
                onClick = { viewModel.onRegionSelect(null) },
                label = { Text(stringResource(R.string.ambassadors_explorer_all_regions)) },
            )
            REGIONS.forEach { region ->
                FilterChip(
                    selected = state.selectedRegion == region,
                    onClick = { viewModel.onRegionSelect(region) },
                    label = { Text(regionLabel(region)) },
                )
            }
        }

        val filtered = state.filteredCountries
        if (filtered.isEmpty()) {
            ZrpEmptyState(
                icon = Icons.Filled.Public,
                title = stringResource(R.string.ambassadors_explorer_no_results),
                modifier = Modifier.padding(top = Spacing.lg),
            )
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(Spacing.lg),
                horizontalArrangement = Arrangement.spacedBy(Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
                modifier = Modifier.fillMaxWidth().height((((filtered.size + 1) / 2) * 84).dp),
            ) {
                items(filtered, key = { it.code }) { country ->
                    CountryCard(country = country, onClick = { viewModel.onCountrySelect(country) })
                }
            }
        }
    }
}

@Composable
private fun CountryCard(country: AmbassadorCountry, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(Radius.md),
        tonalElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = flagEmoji(country.code), style = MaterialTheme.typography.headlineSmall)
            Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
                Text(
                    text = country.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (country.ambassadors > 0) {
                    Text(
                        text = country.ambassadors.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = ZrpRed,
                    )
                }
            }
        }
    }
}

@Composable
private fun CountryDetailSheet(
    country: AmbassadorCountry,
    onBecomeAmbassador: () -> Unit,
    onClose: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(Spacing.lg)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = flagEmoji(country.code), style = MaterialTheme.typography.displaySmall)
            Column(modifier = Modifier.weight(1f).padding(start = Spacing.md)) {
                Text(text = country.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    text = regionLabel(country.region),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.ambassadors_country_close))
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            CountryStat(value = country.ambassadors, label = stringResource(R.string.ambassadors_country_label_ambassadors))
            CountryStat(value = country.communities, label = stringResource(R.string.ambassadors_country_label_communities))
            CountryStat(value = country.activeMembers, label = stringResource(R.string.ambassadors_country_label_members))
        }

        Text(
            text = if (country.ambassadors > 0) {
                stringResource(R.string.ambassadors_country_has_ambassadors, country.name)
            } else {
                stringResource(R.string.ambassadors_country_no_ambassadors_yet, country.name)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg),
        )

        Button(
            onClick = onBecomeAmbassador,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier.fillMaxWidth().padding(top = Spacing.lg, bottom = Spacing.xl),
        ) {
            Text(stringResource(R.string.ambassadors_country_become_cta))
        }
    }
}

@Composable
private fun CountryStat(value: Int, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private data class LevelInfo(val icon: ImageVector, val nameRes: Int, val descRes: Int)

private val LEVELS = listOf(
    LevelInfo(Icons.Filled.Explore, R.string.ambassadors_level_explorer, R.string.ambassadors_level_explorer_desc),
    LevelInfo(Icons.Filled.Public, R.string.ambassadors_level_ambassador, R.string.ambassadors_level_ambassador_desc),
    LevelInfo(Icons.Filled.Groups, R.string.ambassadors_level_community_leader, R.string.ambassadors_level_community_leader_desc),
    LevelInfo(Icons.Filled.EmojiEvents, R.string.ambassadors_level_global_ambassador, R.string.ambassadors_level_global_ambassador_desc),
)

@Composable
private fun LevelsSection() {
    Column(modifier = Modifier.padding(top = Spacing.xxl, bottom = Spacing.lg)) {
        Text(
            text = stringResource(R.string.ambassadors_levels_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.lg),
        )
        Text(
            text = stringResource(R.string.ambassadors_levels_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(start = Spacing.lg, end = Spacing.lg, top = Spacing.xs, bottom = Spacing.lg),
        )

        Column(
            modifier = Modifier.padding(horizontal = Spacing.lg),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            LEVELS.forEach { level -> LevelCard(level) }
        }
    }
}

@Composable
private fun LevelCard(level: LevelInfo) {
    Surface(shape = RoundedCornerShape(Radius.md), tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(ZrpRed.copy(alpha = 0.10f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(level.icon, contentDescription = null, tint = ZrpRed, modifier = Modifier.size(IconSize.md))
            }
            Column(modifier = Modifier.padding(start = Spacing.md)) {
                Text(text = stringResource(level.nameRes), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                    text = stringResource(level.descRes),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}
