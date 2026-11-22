import SwiftUI

/// App-level names for every animation, mapped onto the measured Thayon motion system in PlusMotion.swift
/// (docs/design/motion/motion-spec.md, motion.json). Screens use these names; the values come from the spec.
nonisolated enum Motion {
    /// Fade-and-slide reveals of art, sections and cards (spec 3 to 6): `appear` spring, 1 s, bounce 0.2.
    static let reveal = PlusMotion.appear.animation
    /// Component state changes such as selections, chips and toggles (spec 10): `state` spring, 0.4 s, bounce 0.2.
    static let interaction = PlusMotion.state.animation
    /// Button press scale to 0.98 (spec 9): 200 ms, cubic-bezier(0, 0, 0.58, 1).
    static let press = PlusMotion.press
    /// Onboarding screen-to-screen moves and the selection highlight gliding between rows: `state` spring.
    static let step = PlusMotion.state.animation
    static let glide = PlusMotion.state.animation
    /// Playful pops for bubbles, checkmarks and badges. Not part of the Thayon reference (which has no bounce
    /// on taps); this is the Tolan-style accent the onboarding brief asks for, kept to small elements.
    static let pop = Animation.spring(response: 0.36, dampingFraction: 0.62)
    /// Map camera move to a selected pin (web prototype: 600 ms).
    static let mapEase = Animation.easeInOut(duration: 0.6)

    /// Minimum time the matching screen shows its checklist.
    static let matchingDuration: Double = 2.8
    /// Minimum time the join confirmation shows before the safety list (web: 1400 ms).
    static let joinPause: Double = 1.4
}
