package one.zrp.social.mobile.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminStorageScan

data class AdminStorageUiState(
    val isScanning: Boolean = false,
    val isDeleting: Boolean = false,
    val scan: AdminStorageScan? = null,
    val showDeleteConfirm: Boolean = false,
    // The route's own two numbers from the last completed cleanup:
    // what it confirmed deleted, out of the orphan set it found. Both
    // null until a cleanup has actually run in this session.
    val deletedCount: Int? = null,
    val deletedOutOf: Int? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/storage/page.tsx - GET/POST
 * /admin/cleanup-uploadthing (requireAdmin, ADMIN only: this is a
 * destructive, irreversible storage operation the route deliberately
 * keeps away from moderators).
 *
 * The two calls are kept as separate, deliberate steps exactly like the
 * website's page: scanning is a dry run that changes nothing and can be
 * repeated freely, and only an explicit second action deletes. The
 * scan result is dropped after a successful cleanup - it describes
 * storage that no longer exists, and a stale count is the last thing
 * that should be sitting next to a delete button.
 */
class AdminStorageViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminStorageUiState())
    val state: StateFlow<AdminStorageUiState> = _state.asStateFlow()

    fun scan() {
        if (_state.value.isScanning || _state.value.isDeleting) return
        _state.update { it.copy(isScanning = true, error = null, deletedCount = null, deletedOutOf = null) }
        viewModelScope.launch {
            repository.scanStorage()
                .onSuccess { result -> _state.update { it.copy(isScanning = false, scan = result) } }
                .onFailure { error -> _state.update { it.copy(isScanning = false, error = error.message) } }
        }
    }

    fun requestDelete() {
        val scan = _state.value.scan ?: return
        if (scan.orphanedCount <= 0) return
        _state.update { it.copy(showDeleteConfirm = true) }
    }

    fun cancelDelete() = _state.update { it.copy(showDeleteConfirm = false) }

    fun confirmDelete() {
        if (_state.value.isDeleting) return
        _state.update { it.copy(showDeleteConfirm = false, isDeleting = true, error = null) }
        viewModelScope.launch {
            repository.cleanUpStorage()
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            isDeleting = false,
                            scan = null,
                            deletedCount = result.deleted,
                            deletedOutOf = result.orphanedCount,
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isDeleting = false, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminStorageViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminStorageViewModel(repository) as T
}
