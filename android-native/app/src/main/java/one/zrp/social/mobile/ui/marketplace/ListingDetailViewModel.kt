package one.zrp.social.mobile.ui.marketplace

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MarketplaceRepository
import one.zrp.social.mobile.network.ListingDetail

data class ListingDetailUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    val listing: ListingDetail? = null,
    val activeImageIndex: Int = 0,
    val favorited: Boolean = false,
    val favoriteCount: Int = 0,
    val ownUserId: String? = null,
    val isReportOpen: Boolean = false,
    val isReportSubmitting: Boolean = false,
    val reportError: String? = null,
    val message: String? = null,
)

/**
 * A single listing - the same real GET /listings/{id}, POST
 * /listings/{id}/favorite, and POST /reports (with listingId) routes
 * ListingDetailPage uses. Editing (owner-only) is a later native phase
 * once the create/edit listing screens exist, so the owner view here
 * stays read-only rather than linking to a screen that doesn't exist
 * yet.
 */
class ListingDetailViewModel(
    private val listingId: String,
    private val repository: MarketplaceRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ListingDetailUiState())
    val state: StateFlow<ListingDetailUiState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, notFound = false) }
        viewModelScope.launch {
            repository.getListing(listingId)
                .onSuccess { listing ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            listing = listing,
                            favorited = listing.favorited,
                            favoriteCount = listing._count.favorites,
                            activeImageIndex = 0,
                        )
                    }
                }
                .onFailure {
                    _state.update { it.copy(isLoading = false, notFound = true) }
                }
        }
    }

    fun onImageSelect(index: Int) {
        _state.update { it.copy(activeImageIndex = index) }
    }

    fun onPreviousImage() {
        val listing = _state.value.listing ?: return
        val count = listing.imageUrls.size
        if (count == 0) return
        _state.update { it.copy(activeImageIndex = (it.activeImageIndex - 1 + count) % count) }
    }

    fun onNextImage() {
        val listing = _state.value.listing ?: return
        val count = listing.imageUrls.size
        if (count == 0) return
        _state.update { it.copy(activeImageIndex = (it.activeImageIndex + 1) % count) }
    }

    fun toggleFavorite() {
        val wasFavorited = _state.value.favorited
        _state.update {
            it.copy(
                favorited = !wasFavorited,
                favoriteCount = it.favoriteCount + if (wasFavorited) -1 else 1,
            )
        }
        viewModelScope.launch {
            repository.toggleFavorite(listingId).onFailure {
                _state.update {
                    it.copy(
                        favorited = wasFavorited,
                        favoriteCount = it.favoriteCount + if (wasFavorited) 1 else -1,
                    )
                }
            }
        }
    }

    fun onOpenReport() {
        _state.update { it.copy(isReportOpen = true, reportError = null) }
    }

    fun onCancelReport() {
        _state.update { it.copy(isReportOpen = false) }
    }

    fun submitReport(reason: String, details: String?) {
        _state.update { it.copy(isReportSubmitting = true, reportError = null) }
        viewModelScope.launch {
            repository.reportListing(listingId, reason, details)
                .onSuccess {
                    _state.update { it.copy(isReportSubmitting = false, isReportOpen = false, message = "reportSubmitted") }
                }
                .onFailure { error ->
                    _state.update { it.copy(isReportSubmitting = false, reportError = error.message) }
                }
        }
    }

    fun consumeMessage() {
        _state.update { it.copy(message = null) }
    }
}

class ListingDetailViewModelFactory(
    private val listingId: String,
    private val repository: MarketplaceRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ListingDetailViewModel(listingId, repository) as T
    }
}
