package one.zrp.social.mobile.network

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import one.zrp.social.mobile.data.TokenStore
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * Base HTTP client for the existing ZRP REST API (the web repo's
 * src/app/api routes) - no backend rewrite, this talks to the same
 * endpoints the website itself calls. Authenticated requests attach the
 * mobile session token (from POST /mobile/auth/login) as the exact same
 * cookie NextAuth's own browser session uses, via the interceptor below
 * - see login/route.ts's comment for why: every existing route already
 * trusts that cookie however it arrives, so nothing about those 217
 * routes needs to change for a native client to use them.
 */
object ApiClient {
    private const val BASE_URL = "https://zrp.one/api/"

    private lateinit var tokenStore: TokenStore

    fun init(context: Context) {
        if (::tokenStore.isInitialized) return
        tokenStore = TokenStore(context.applicationContext)
    }

    // Exposed so AuthRepository shares this exact instance rather than
    // opening a second EncryptedSharedPreferences handle onto the same
    // underlying file. Named getTokenStore() rather than tokenStore()
    // because Kotlin treats a member function and a member property of
    // the same name in the same scope as a genuine overload-resolution
    // ambiguity at every call site, not two independently resolvable
    // members.
    fun getTokenStore(): TokenStore {
        check(::tokenStore.isInitialized) {
            "ApiClient.init(context) must be called (see ZrpApplication) before use."
        }
        return tokenStore
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val sessionCookieInterceptor = okhttp3.Interceptor { chain ->
        val original = chain.request()
        val token = tokenStore.getSessionToken()

        val request = if (token != null) {
            original.newBuilder()
                .addHeader("Cookie", "${tokenStore.getCookieName()}=$token")
                .build()
        } else {
            original
        }

        chain.proceed(request)
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(sessionCookieInterceptor)
        .addInterceptor(loggingInterceptor)
        .build()

    private val retrofit: Retrofit by lazy {
        check(::tokenStore.isInitialized) {
            "ApiClient.init(context) must be called (see ZrpApplication) before any request."
        }
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    val authApi: AuthApi by lazy { retrofit.create(AuthApi::class.java) }
    val postsApi: PostsApi by lazy { retrofit.create(PostsApi::class.java) }
    val usersApi: UsersApi by lazy { retrofit.create(UsersApi::class.java) }
}
