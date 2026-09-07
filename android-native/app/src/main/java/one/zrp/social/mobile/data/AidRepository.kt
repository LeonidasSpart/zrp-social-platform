package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateCampaignRequest
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.HelpCampaignDetail
import one.zrp.social.mobile.network.HelpCampaignSummary
import one.zrp.social.mobile.network.HelpCampaignsPage
import one.zrp.social.mobile.network.HelpMyCampaignsPage
import one.zrp.social.mobile.network.HelpOffer
import one.zrp.social.mobile.network.HelpOfferRequest
import one.zrp.social.mobile.network.HelpWithdrawRequest
import one.zrp.social.mobile.network.HelpWithdrawal
import one.zrp.social.mobile.network.UpdateOfferStatusRequest

/**
 * ZRP Aid - the same real /help routes the website's /aid pages use:
 * browse/search a humanitarian campaign, offer non-monetary help
 * (supplies/skills/volunteers), an organizer creating a campaign and
 * managing offers/withdrawals.
 *
 * Deliberately does NOT wrap POST /help/{id}/contribute (money
 * donations). Per src/lib/native-payment-policy.ts's own documented
 * reasoning (Apple 3.1.1 / Google Play Payments, applied conservatively
 * to a cause-based campaign), this codebase has never built a crypto
 * money-payment flow into the native Android app at all - not Tips, not
 * Premium purchase, not the plan-upgrade flow, and now not Aid
 * contributions either, rather than shipping a payment surface that
 * would need App Store/Play Store review scrutiny. Requesting a
 * withdrawal (an organizer cashing out funds already raised) is NOT a
 * payment-in and stays fully native, matching the same policy file's
 * explicit carve-out for creator withdrawals.
 */
class AidRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getOwnBadgeType(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.badgeType
    }

    suspend fun getCampaigns(cursor: String? = null, category: String? = null): Result<HelpCampaignsPage> = runCatching {
        ApiClient.aidApi.getCampaigns(cursor = cursor, category = category)
    }

    suspend fun getCampaign(id: String): Result<HelpCampaignDetail> = runCatching {
        ApiClient.aidApi.getCampaign(id).campaign
    }

    suspend fun createCampaign(
        category: String,
        needTypes: List<String>,
        title: String,
        description: String,
        location: String?,
        goalAmount: Double?,
        imageUrls: List<String>,
        proofUrls: List<String>,
    ): Result<HelpCampaignSummary> = runCatching {
        ApiClient.aidApi.createCampaign(
            CreateCampaignRequest(
                category = category,
                needTypes = needTypes,
                title = title,
                description = description,
                location = location,
                goalAmount = goalAmount,
                imageUrls = imageUrls,
                proofUrls = proofUrls,
            ),
        ).campaign
    }

    suspend fun submitOffer(campaignId: String, needType: String, message: String): Result<HelpOffer> = runCatching {
        ApiClient.aidApi.submitOffer(campaignId, HelpOfferRequest(needType = needType, message = message)).offer
    }

    suspend fun getOffers(campaignId: String): Result<List<HelpOffer>> = runCatching {
        ApiClient.aidApi.getOffers(campaignId).offers
    }

    suspend fun updateOfferStatus(offerId: String, status: String): Result<HelpOffer> = runCatching {
        ApiClient.aidApi.updateOfferStatus(offerId, UpdateOfferStatusRequest(status)).offer
    }

    suspend fun requestWithdrawal(campaignId: String, amount: Double): Result<HelpWithdrawal> = runCatching {
        ApiClient.aidApi.requestWithdrawal(campaignId, HelpWithdrawRequest(amount)).withdrawal
    }

    suspend fun getMyCampaigns(cursor: String? = null): Result<HelpMyCampaignsPage> = runCatching {
        ApiClient.aidApi.getMyCampaigns(cursor)
    }

    suspend fun reportCampaign(campaignId: String, reason: String, details: String?): Result<Unit> = runCatching {
        ApiClient.reportsApi.createReport(CreateReportRequest(campaignId = campaignId, reason = reason, details = details))
    }
}
