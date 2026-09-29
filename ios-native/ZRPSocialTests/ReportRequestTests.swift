import XCTest
@testable import ZRPSocial

/// `POST /api/reports` accepts eight polymorphic targets; this app's
/// `ReportRequest.Target` only ever had four (post/comment/listing/user)
/// despite Opportunity and HELP-campaign reporting already having a real
/// backend field and working web + Android UI (Task #5, iOS parity
/// audit). Covers that the two new cases encode to the exact field names
/// the route expects, and that no case accidentally encodes more than
/// one target id at once (the route treats "no target field at all" and
/// "two target fields at once" both as malformed).
final class ReportRequestTests: XCTestCase {

    private func encodedFields(_ target: ReportRequest.Target) throws -> [String: Any] {
        let request = ReportRequest(target: target, reason: .spam, details: nil)
        let data = try JSONEncoder().encode(request)
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return object
    }

    private static let allTargetKeys = ["postId", "commentId", "listingId", "userId", "opportunityId", "campaignId"]

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

    /// Regression guard: adding the two new cases must not disturb the
    /// four that already shipped.
    func testExistingTargetsStillEncodeExactlyOneFieldEach() throws {
        XCTAssertEqual(try encodedFields(.post("p1"))["postId"] as? String, "p1")
        XCTAssertEqual(try encodedFields(.comment("c1"))["commentId"] as? String, "c1")
        XCTAssertEqual(try encodedFields(.listing("l1"))["listingId"] as? String, "l1")
        XCTAssertEqual(try encodedFields(.user("u1"))["userId"] as? String, "u1")
    }

    func testReasonIsAlwaysTheStoredEnglishRawValueNeverALocalizedLabel() throws {
        let fields = try encodedFields(.opportunity("opp-1"))
        XCTAssertEqual(fields["reason"] as? String, "Spam")
    }
}
