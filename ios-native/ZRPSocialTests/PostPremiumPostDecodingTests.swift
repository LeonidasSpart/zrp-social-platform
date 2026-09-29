import XCTest
@testable import ZRPSocial

/// `Post` never decoded the `premiumPost` field `applyPremiumGating`
/// (`src/lib/premium-content.ts`) attaches to a locked post on every
/// post-reading route, including `GET /api/videos` (Shorts) - so a
/// locked Short's video pane rendered as a permanent blank/generic icon
/// instead of the lock+price+link treatment ZRP Discover already gets
/// right. This is the decode half of that fix (Task #5, iOS parity
/// audit); `ShortsView.swift`'s `lockedContent(_:)` is the render half.
final class PostPremiumPostDecodingTests: XCTestCase {

    private func decode(_ json: String) throws -> Post {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Post.self, from: json.data(using: .utf8)!)
    }

    func testAnOrdinaryPostWithNoPremiumFieldDecodesWithNilPremiumPost() throws {
        let post = try decode("""
        {
            "id": "post-1", "content": "hello", "createdAt": "2024-01-01T00:00:00Z",
            "author": {"id": "u1", "username": "alice"}, "_count": {}
        }
        """)
        XCTAssertNil(post.premiumPost)
    }

    func testALockedPremiumPostDecodesThePriceCurrencyAndPreview() throws {
        let post = try decode("""
        {
            "id": "post-2", "content": "Members-only preview...", "createdAt": "2024-01-01T00:00:00Z",
            "author": {"id": "u2", "username": "creator"}, "_count": {},
            "premiumPost": {
                "id": "premium-1", "price": 4.99, "currency": "USDC",
                "previewContent": "Members-only preview...", "locked": true
            }
        }
        """)
        let premiumPost = try XCTUnwrap(post.premiumPost)
        XCTAssertEqual(premiumPost.id, "premium-1")
        XCTAssertEqual(premiumPost.price, 4.99)
        XCTAssertEqual(premiumPost.currency, "USDC")
        XCTAssertEqual(premiumPost.previewContent, "Members-only preview...")
        XCTAssertTrue(premiumPost.locked)
    }

    func testAPurchasedPremiumPostDecodesAsUnlocked() throws {
        let post = try decode("""
        {
            "id": "post-3", "content": "The full content is now visible.", "createdAt": "2024-01-01T00:00:00Z",
            "author": {"id": "u3", "username": "creator"}, "_count": {},
            "premiumPost": {
                "id": "premium-2", "price": 4.99, "currency": "USDC",
                "previewContent": "Preview...", "locked": false
            }
        }
        """)
        XCTAssertEqual(try XCTUnwrap(post.premiumPost).locked, false)
    }

    /// The exact construction `ShortPageView`/`ShortsViewModel` decode
    /// from `GET /api/videos` for a locked Short - `imageUrl` redacted to
    /// null alongside a non-nil `premiumPost`, which is what previously
    /// produced a permanently blank video pane.
    func testALockedShortDecodesWithNoImageURLAndALockedPremiumPost() throws {
        let post = try decode("""
        {
            "id": "short-1", "content": "Locked short preview", "createdAt": "2024-01-01T00:00:00Z",
            "author": {"id": "u4", "username": "creator"}, "_count": {},
            "imageUrl": null,
            "premiumPost": {
                "id": "premium-3", "price": 2, "currency": "USDC",
                "previewContent": "Locked short preview", "locked": true
            }
        }
        """)
        XCTAssertNil(post.imageUrl)
        XCTAssertEqual(try XCTUnwrap(post.premiumPost).locked, true)
    }
}
