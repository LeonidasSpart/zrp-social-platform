import XCTest
@testable import ZRPSocial

/// ZRP platform policy: minimum age 16 (`zrpMinimumRegistrationAge`),
/// enforced server-side in `POST /api/auth/register` for any request
/// that supplies a birthdate, required outright for iOS. These tests
/// cover the client-side courtesy logic added alongside that gate:
/// `ageInYears` (mirroring the exact under-16/exactly-16/adult boundary
/// cases already proven server-side in
/// src/app/api/auth/register/__tests__/route.integration.test.ts) and
/// `RegisterViewModel.birthdateWireValue` (the timezone/calendar-safe
/// `yyyy-MM-dd` formatter). None of this is the real gate - the server
/// re-derives age from the wire value it receives and is the sole
/// authority - so these only need to agree with a real person's
/// expectations, not with the server down to the exact timezone.
final class RegisterViewModelTests: XCTestCase {

    private var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func utcDate(_ year: Int, _ month: Int, _ day: Int) -> Date {
        utcCalendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    // MARK: - ageInYears

    func testAgeInYearsRejectsOneDayShortOfBoundary() {
        // Born 2010-06-15; "today" is 2026-06-14 - one day before the
        // 16th birthday, so still 15.
        let birthdate = utcDate(2010, 6, 15)
        let asOf = utcDate(2026, 6, 14)
        XCTAssertEqual(ageInYears(birthdate: birthdate, asOf: asOf, calendar: utcCalendar), 15)
        XCTAssertLessThan(ageInYears(birthdate: birthdate, asOf: asOf, calendar: utcCalendar), zrpMinimumRegistrationAge)
    }

    func testAgeInYearsAcceptsExactly16thBirthday() {
        let birthdate = utcDate(2010, 6, 15)
        let asOf = utcDate(2026, 6, 15)
        XCTAssertEqual(ageInYears(birthdate: birthdate, asOf: asOf, calendar: utcCalendar), zrpMinimumRegistrationAge)
    }

    func testAgeInYearsAcceptsClearlyAdult() {
        let birthdate = utcDate(1996, 6, 15)
        let asOf = utcDate(2026, 6, 15)
        XCTAssertEqual(ageInYears(birthdate: birthdate, asOf: asOf, calendar: utcCalendar), 30)
    }

    func testAgeInYearsHandlesLeapYearBirthdateCorrectly() {
        // Born on a leap day; "today" is the day before the following
        // Feb 28/29 boundary in a non-leap year - must not crash or
        // misround just because Feb 29 doesn't exist every year.
        let birthdate = utcDate(2008, 2, 29)
        let asOf = utcDate(2024, 2, 28)
        XCTAssertEqual(ageInYears(birthdate: birthdate, asOf: asOf, calendar: utcCalendar), 15)
    }

    // MARK: - birthdateWireValue

    func testBirthdateWireValueFormatsAsIsoDate() {
        let date = utcDate(1996, 3, 5)
        let value = RegisterViewModel.birthdateWireValue(for: date, timeZone: TimeZone(identifier: "UTC")!)
        XCTAssertEqual(value, "1996-03-05")
    }

    func testBirthdateWireValueDoesNotShiftDayForTimezonesAheadOfUtc() {
        // 1996-03-05 23:30 UTC is already 1996-03-06 local in a
        // UTC+1 timezone - the wire value must reflect the LOCAL
        // calendar day the picker showed, not the UTC day.
        let date = utcDate(1996, 3, 5).addingTimeInterval(23.5 * 3600)
        let value = RegisterViewModel.birthdateWireValue(for: date, timeZone: TimeZone(identifier: "Europe/Berlin")!)
        XCTAssertEqual(value, "1996-03-06")
    }

    func testBirthdateWireValueDoesNotShiftDayForTimezonesBehindUtc() {
        // 1996-03-05 00:30 UTC is still 1996-03-04 local in a UTC-8
        // timezone - must not silently use the UTC day either.
        let date = utcDate(1996, 3, 5).addingTimeInterval(0.5 * 3600)
        let value = RegisterViewModel.birthdateWireValue(for: date, timeZone: TimeZone(identifier: "America/Los_Angeles")!)
        XCTAssertEqual(value, "1996-03-04")
    }

    func testBirthdateWireValuePadsSingleDigitMonthAndDay() {
        let date = utcDate(2000, 1, 9)
        let value = RegisterViewModel.birthdateWireValue(for: date, timeZone: TimeZone(identifier: "UTC")!)
        XCTAssertEqual(value, "2000-01-09")
    }

    // MARK: - RegisterViewModel.isOldEnough / canSubmit gating

    @MainActor
    func testIsOldEnoughFalseForUnder16Birthdate() {
        let viewModel = RegisterViewModel(repository: StubAuthRepository())
        viewModel.birthdate = Calendar.current.date(byAdding: .year, value: -10, to: Date())!
        XCTAssertFalse(viewModel.isOldEnough)
        XCTAssertFalse(viewModel.canSubmit)
    }

    @MainActor
    func testIsOldEnoughTrueForAdultBirthdate() {
        let viewModel = RegisterViewModel(repository: StubAuthRepository())
        viewModel.birthdate = Calendar.current.date(byAdding: .year, value: -30, to: Date())!
        XCTAssertTrue(viewModel.isOldEnough)
    }

    @MainActor
    func testCanSubmitFalseWithoutTermsAcceptedEvenWhenOldEnough() {
        let viewModel = RegisterViewModel(repository: StubAuthRepository())
        viewModel.username = "validname"
        viewModel.email = "person@example.com"
        viewModel.password = "password123"
        viewModel.birthdate = Calendar.current.date(byAdding: .year, value: -30, to: Date())!
        viewModel.termsAccepted = false
        XCTAssertTrue(viewModel.isOldEnough)
        XCTAssertFalse(viewModel.canSubmit)
    }

    @MainActor
    func testCanSubmitTrueWithValidAdultAndTermsAccepted() {
        let viewModel = RegisterViewModel(repository: StubAuthRepository())
        viewModel.username = "validname"
        viewModel.email = "person@example.com"
        viewModel.password = "password123"
        viewModel.birthdate = Calendar.current.date(byAdding: .year, value: -30, to: Date())!
        viewModel.termsAccepted = true
        XCTAssertTrue(viewModel.canSubmit)
    }

    @MainActor
    func testLatestAllowedBirthdateIsExactlyMinimumAgeYearsAgo() {
        let viewModel = RegisterViewModel(repository: StubAuthRepository())
        let expected = Calendar.current.date(byAdding: .year, value: -zrpMinimumRegistrationAge, to: Date())!
        XCTAssertEqual(
            Calendar.current.dateComponents([.year, .month, .day], from: viewModel.latestAllowedBirthdate),
            Calendar.current.dateComponents([.year, .month, .day], from: expected)
        )
    }
}

/// Minimal no-op stand-in so these tests can construct a
/// `RegisterViewModel` without a real network layer - none of the
/// cases above call `submit()` or hit the repository.
private struct StubAuthRepository: AuthRepositoryProtocol {
    func login(identifier: String, password: String) async throws -> CurrentUser {
        throw ApiError.unauthorized
    }
    func loginWithApple(_ credential: AppleSignInCredential) async throws -> CurrentUser {
        throw ApiError.unauthorized
    }
    func restoreSession() async throws -> CurrentUser? { nil }
    func logout() async {}
    func register(_ request: RegistrationRequest) async throws {}
    func checkUsername(_ username: String) async throws -> UsernameAvailability {
        throw ApiError.unauthorized
    }
    func resendVerification(identifier: String) async throws {}
    func requestPasswordReset(email: String) async throws {}
}
