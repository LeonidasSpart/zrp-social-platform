package one.zrp.social.mobile.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * Base HTTP client for the existing ZRP REST API (src/app/api/** in the
 * web repo) - no backend rewrite, this talks to the same endpoints the
 * website itself calls. Not wired to any auth yet: NextAuth's default
 * session is an httpOnly browser cookie, which a native OkHttp client
 * has no equivalent of, so a bearer-token issuance/refresh endpoint is
 * real backend work for Phase 3 (Authentication) before any request
 * here can act as a signed-in user. This client is deliberately just
 * the transport foundation.
 */
object ApiClient {
    private const val BASE_URL = "https://zrp.one/api/"

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .build()

    val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
}
