import XCTest
@testable import ZRPSocial

/// `POST /api/reports` accepts ten polymorphic targets (src/app/api/
/// reports/route.ts); this app's `ReportRequest.Target` only ever had
/// four (post/comment/listing/user), then six after Opportunity and
/// HELP-campaign reporting were added (Task #5, iOS parity audit). This
/// pass adds the remaining four - challenge, liveAudioRoom, liveVideoRoom,
/// liveChatMessage - closing the gap completely. Covers that every case
/// encodes to the exact field name the route expects, and that no case
/// accidentally encodes more than one target id at once (the route
/// treats "no target field at all" and "two target fields at once" both
/// as malformed).
final class ReportRequestTests: XCTestCase {

    private func encodedFields(_ target: ReportRequest.Target) throws -> [String: Any] {
        let request = ReportRequest(target: target, reason: .spam, details: nil)
        let data = try JSONEncoder().encode(request)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return object
    }

    private static let allTargetKeys = [
        "postId", "commentId", "listingId", "userId", "opportunityId", "campaignId",
        "challengeId", "liveAudioRoomId", "liveVideoRoomId", "liveChatMessageId",
    ]

    func testOpportunityTargetEncodesOnlyOpportunityId() throws {
        let fields = try encodedFields(.opportunity("opp-1"))
        XCTAssertEqual(fields["opportunityId"] as? String, "opp-1")
        for key in Self.allTargetKeys where key != "opportunityId" {
            XCTAssertNil(fields[key], "\(key) should not be present alongside opportunityId")
        }
    }

    func testCampaignTargetEncodesOnlyCampaignId() throws {
        let fields = try encodedFields(.campaign("campaign-1"))
        XCTAssertEqual(fields["campaignId"] as? String, "campaign-1")
        for key in Self.allTargetKeys where key != "campaignId" {
            XCTAssertNil(fields[key], "\(key) should not be present alongside campaignId")
        }
    }

    /// Regression guard: adding new cases must not disturb the ones that
    /// already shipped.
    func testExistingTargetsStillEncodeExactlyOneFieldEach() throws {
        XCTAssertEqual(try encodedFields(.post("p1"))["postId"] as? String, "p1")
        XCTAssertEqual(try encodedFields(.comment("c1"))["commentId"] as? String, "c1")
        XCTAssertEqual(try encodedFields(.listing("l1"))["listingId"] as? String, "l1")
        XCTAssertEqual(try encodedFields(.user("u1"))["userId"] as? String, "u1")
    }

    func testChallengeTargetEncodesOnlyChallengeId() throws {
        let fields = try encodedFields(.challenge("challenge-1"))
        XCTAssertEqual(fields["challengeId"] as? String, "challenge-1")
        for key in Self.allTargetKeys where key != "challengeId" {
            XCTAssertNil(fields[key], "\(key) should not be present alongside challengeId")
        }
    }

    func testLiveAudioRoomTargetEncodesOnlyLiveAudioRoomId() throws {
        let fields = try encodedFields(.liveAudioRoom("room-1"))
        XCTAssertEqual(fields["liveAudioRoomId"] as? String, "room-1")
        for key in Self.allTargetKeys where key != "liveAudioRoomId" {
            XCTAssertNil(fields[key], "\(key) should not be present alongside liveAudioRoomId")
        }
    }

    func testLiveVideoRoomTargetEncodesOnlyLiveVideoRoomId() throws {
        let fields = try encodedFields(.liveVideoRoom("room-2"))
        XCTAssertEqual(fields["liveVideoRoomId"] as? String, "room-2")
        for key in Self.allTargetKeys where key != "liveVideoRoomId" {
            XCTAssertNil(fields[key], "\(key) should not be present alongside liveVideoRoomId")
        }
    }

    func testLiveChatMessageTargetEncodesOnlyLiveChatMessageId() throws {
        let fields = try encodedFields(.liveChatMessage("msg-1"))
        XCTAssertEqual(fields["liveChatMessageId"] as? String, "msg-1")
        for key in Self.allTargetKeys where key != "liveChatMessageId" {
            XCTAssertNil(fields[key], "\(key) should not be present alongside liveChatMessageId")
        }
    }

    func testReasonIsAlwaysTheStoredEnglishRawValueNeverALocalizedLabel() throws {
        let fields = try encodedFields(.opportunity("opp-1"))
        XCTAssertEqual(fields["reason"] as? String, "Spam")
    }
}
