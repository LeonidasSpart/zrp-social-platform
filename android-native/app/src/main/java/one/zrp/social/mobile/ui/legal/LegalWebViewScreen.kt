package one.zrp.social.mobile.ui.legal

import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import one.zrp.social.mobile.R

/**
 * Terms of Service, Privacy Policy, and Community Guidelines are the
 * one place in this app that deliberately loads the real zrp.one pages
 * in a WebView rather than a native Compose screen - see this app's
 * own established "no WebView" convention elsewhere (LoginScreen's own
 * KDoc) for why that's the exception, not the rule, here: these are
 * long-form static legal text (hundreds of translated paragraphs each,
 * already fully localized on the website), and a native reimplementation
 * would be a second copy that silently drifts out of sync the next
 * time Legal updates the real pages - a real compliance risk a Terms/
 * Privacy page specifically cannot afford. Loading the live page is the
 * only way this screen is guaranteed to always show the current terms.
 * No cookies/session needed - all three pages are public.
 */
@Composable
fun LegalWebViewScreen(url: String, title: String, onBack: () -> Unit) {
    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }
    // Bumped to force AndroidView's factory to run again on retry - a
    // WebView has no public "reload from a fresh state" call that also
    // clears whatever partial/error content it already rendered, so this
    // recreates the WebView instance instead.
    var loadAttempt by remember { mutableIntStateOf(0) }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }

            Box(modifier = Modifier.fillMaxSize()) {
                if (!hasError) {
                    key(loadAttempt) {
                        AndroidView(
                            factory = { context ->
                                WebView(context).apply {
                                    webViewClient = object : WebViewClient() {
                                        override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                                            isLoading = false
                                        }

                                        // The page itself failing to load (DNS/timeout/offline) -
                                        // without this override, the WebView silently renders
                                        // its own bare native error page with no way back for
                                        // the user other than the toolbar's own back arrow.
                                        override fun onReceivedError(
                                            view: WebView?,
                                            request: WebResourceRequest?,
                                            error: WebResourceError?,
                                        ) {
                                            if (request?.isForMainFrame != false) {
                                                isLoading = false
                                                hasError = true
                                            }
                                        }

                                        // The page loading but the server itself returning a
                                        // non-2xx status (a 404 for a renamed/removed real page,
                                        // or a redirect-to-login for a page middleware doesn't
                                        // yet treat as public) - a WebView otherwise renders
                                        // that response body as-is with no indication anything
                                        // went wrong.
                                        override fun onReceivedHttpError(
                                            view: WebView?,
                                            request: WebResourceRequest?,
                                            errorResponse: WebResourceResponse?,
                                        ) {
                                            if (request?.isForMainFrame != false) {
                                                isLoading = false
                                                hasError = true
                                            }
                                        }
                                    }
                                    settings.javaScriptEnabled = true
                                    // Real pages (this one included, via the shared
                                    // ThemeProvider wrapping every page) read/write
                                    // localStorage - without this, that throws inside
                                    // the page's own client code, which its own error
                                    // boundary then surfaces as a generic failure.
                                    settings.domStorageEnabled = true
                                    loadUrl(url)
                                }
                            },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }

                if (isLoading && !hasError) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }

                if (hasError) {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.legal_load_error),
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center,
                        )
                        Button(
                            onClick = {
                                hasError = false
                                isLoading = true
                                loadAttempt++
                            },
                            modifier = Modifier.padding(top = 16.dp),
                        ) {
                            Text(stringResource(R.string.action_retry))
                        }
                    }
                }
            }
        }
    }
}
