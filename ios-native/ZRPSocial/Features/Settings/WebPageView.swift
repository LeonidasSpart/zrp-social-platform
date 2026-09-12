import SafariServices
import SwiftUI
import UIKit

/// A ZRP page that exists only on the web, opened inside the app.
///
/// Terms of Service, the Privacy Policy, the Community Guidelines, About,
/// the Help Center and the Community & Leadership Code are long-form text
/// that is already written, already reviewed, and already translated into
/// all eleven languages on zrp.one. A native reimplementation would be a
/// second copy that drifts the next time Legal changes a paragraph -
/// which is a compliance risk a Terms or Privacy page specifically cannot
/// carry. Android reached the same conclusion and loads the same live
/// pages.
///
/// All six are public, so nothing here needs the session: `SFSafariViewController`
/// has its own cookie store and never sees the app's.
enum WebPage: String, Hashable, Identifiable, CaseIterable {
    case terms
    case privacy
    case guidelines
    case about
    case help
    case communityCode = "community-code"

    // The five below were reachable from the website's sidebar and from
    // nowhere in this app. Same shape as their neighbours - public,
    // static, long-form, already translated - so they arrive the same
    // way rather than as five native screens that would have to be
    // maintained in parallel with Legal's and Comms' copy.
    case faq
    case contact
    case careers
    case investors
    case press

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .terms: return .footerTermsOfService
        case .privacy: return .footerPrivacyPolicy
        case .guidelines: return .helpFooterGuidelines
        case .about: return .navAboutZrp
        case .help: return .footerHelpCenter
        case .communityCode: return .communityCodeNavLabel
        case .faq: return .footerFaq
        case .contact: return .footerContact
        case .careers: return .footerCareers
        case .investors: return .footerInvestors
        // The website labels this one "Press Kit" while the route is
        // /press. The label follows the website, not the path.
        case .press: return .footerPressKit
        }
    }

    var systemImage: String {
        switch self {
        case .terms: return "doc.text"
        case .privacy: return "hand.raised"
        case .guidelines: return "person.3"
        case .about: return "info.circle"
        case .help: return "questionmark.circle"
        case .communityCode: return "checkmark.shield"
        case .faq: return "questionmark.bubble"
        case .contact: return "envelope"
        case .careers: return "briefcase"
        case .investors: return "chart.line.uptrend.xyaxis"
        case .press: return "newspaper"
        }
    }

    /// The live page on the official domain - the same paths the website
    /// and the Android app use. Constructed from a literal, so this
    /// cannot be `nil` in practice; the optional keeps the force-unwrap
    /// out of the app.
    var url: URL? {
        URL(string: "https://zrp.one/\(rawValue)")
    }
}

/// Presents a `WebPage` in `SFSafariViewController`.
///
/// Apple's own in-app browser rather than a bare `WKWebView`: it brings
/// the address bar that shows the reader which domain they are actually
/// on, Reader mode for long legal text, Share, and the system's own
/// content blockers - none of which a hand-built web view would have.
/// It is a system framework, so the app keeps its zero third-party
/// dependencies.
struct WebPageView: UIViewControllerRepresentable {

    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let configuration = SFSafariViewController.Configuration()
        // Legal text is long; Reader is offered where the page supports it.
        configuration.entersReaderIfAvailable = false
        let controller = SFSafariViewController(url: url, configuration: configuration)
        controller.preferredControlTintColor = UIColor(ZrpColor.red)
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
