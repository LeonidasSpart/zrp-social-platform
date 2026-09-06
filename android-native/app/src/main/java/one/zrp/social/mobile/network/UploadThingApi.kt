package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Query

data class UploadFileMeta(
    val name: String,
    val size: Long,
    val type: String,
    val lastModified: Long,
)

data class UploadThingUploadRequest(
    val input: Any? = null,
    val files: List<UploadFileMeta>,
)

data class PresignedUpload(
    val url: String,
    val key: String,
    val name: String,
    val customId: String?,
)

/**
 * UploadThing has no Android/native SDK - this is a from-scratch native
 * client for the exact same wire protocol the website's own
 * @uploadthing/react client uses, reverse-engineered from the real,
 * installed uploadthing v7.7.4 package's own source (not guessed):
 * node_modules/uploadthing/dist/ut-reporter-*.js shows the client POSTs
 * JSON here (?actionType=upload&slug=<router key>) to request presigned
 * upload URLs from our own /api/uploadthing route (src/app/api/
 * uploadthing/route.ts, using src/lib/uploadthing.ts's ourFileRouter),
 * which itself talks to UploadThing's ingest servers using our app's
 * server-only secret - this call never reaches UploadThing directly.
 * The actual file bytes are PUT straight to the presigned URL this
 * returns (see MediaUploader), not through this endpoint.
 */
interface UploadThingApi {
    @POST("uploadthing")
    suspend fun requestPresignedUrls(
        @Query("actionType") actionType: String = "upload",
        @Query("slug") slug: String,
        @Body request: UploadThingUploadRequest,
    ): List<PresignedUpload>
}
