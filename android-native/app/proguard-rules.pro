# Add project specific ProGuard rules here.

# ---------------------------------------------------------------------------
# Gson field-name reflection (ZRP's entire API surface)
# ---------------------------------------------------------------------------
# Every request/response model in this app (one.zrp.social.mobile.network,
# .data, .solana, .launchpad, and several Socket.IO payload classes under
# .ui.*) is (de)serialized by Gson via plain reflection on the Kotlin
# property names - there is not a single @SerializedName anywhere in this
# codebase (verified: `grep -rl "@SerializedName" app/src/main/java` is
# empty). Gson matches JSON keys to field names by string comparison, so if
# R8 renames a field, Gson silently stops populating it (the field goes
# null/default, not a crash) - for 650+ model classes across every feature,
# that is a correctness regression, not a cosmetic one.
#
# Keeping just <fields> (not the whole class) still lets R8 rename classes
# and methods and strip unused code - which is what actually drives the
# "code shrinker" / obfuscation metrics Play Console measures - without the
# one thing that is unsafe here: field names Gson depends on.
-keepclassmembers class one.zrp.social.mobile.** {
    <fields>;
}

# Gson's own documented minimum ProGuard rules (gson/examples/android-proguard-example):
# generic type information on TypeToken-based collections, annotations
# (Expose/SerializedName even though unused today), and the TypeAdapter
# machinery Gson's reflective adapter walks at runtime.
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.reflect.TypeToken
-keep class * extends com.google.gson.reflect.TypeToken
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-dontwarn sun.misc.**

# ---------------------------------------------------------------------------
# Retrofit / OkHttp
# ---------------------------------------------------------------------------
# Retrofit builds its service implementations with a dynamic proxy that
# reads method/parameter annotations and generic signatures at runtime.
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes Exceptions, InnerClasses, EnclosingMethod
-keep interface one.zrp.social.mobile.network.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**

# ---------------------------------------------------------------------------
# Socket.IO (realtime DMs, typing, presence, calls, ZRP Live)
# ---------------------------------------------------------------------------
# io.socket:socket.io-client is a plain jar (not an .aar), so unlike most of
# this app's other third-party dependencies it carries no bundled consumer
# ProGuard rules of its own - kept in full rather than guessing at a
# narrower surface, since every realtime feature in the app depends on it.
-keep class io.socket.** { *; }
-dontwarn io.socket.**
-dontwarn org.json.**

# ---------------------------------------------------------------------------
# LiveKit / WebRTC (ZRP Live audio & video rooms, 1:1 calling)
# ---------------------------------------------------------------------------
# Native JNI bridge methods are already protected by the default Android
# rules (getDefaultProguardFile("proguard-android-optimize.txt"), already
# applied alongside this file). Kept conservatively on top of that: this
# sandbox has no Android SDK/emulator to runtime-verify a signaling or
# media-pipeline regression against, so erring toward "keep more than
# strictly necessary" here rather than a narrower rule unverified at
# runtime.
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
-keep class io.livekit.android.** { *; }
-keep class livekit.** { *; }
-dontwarn livekit.**

# ---------------------------------------------------------------------------
# Solana (Mobile Wallet Adapter, ZRP Launchpad)
# ---------------------------------------------------------------------------
-keep class com.solana.** { *; }
-dontwarn com.solana.**

# The Mobile Wallet Adapter client's own buffer shim (com.funkatronics.buffer,
# a transitive dependency, not imported directly anywhere in this app) calls
# into com.ditchoom.buffer.BufferFactoryJvm, a Kotlin-Multiplatform JVM-target
# class that is genuinely absent from the resolved Android classpath - not
# a shrinking mistake, R8 itself reported it as a missing class (first real
# CI run of this file, build 35: "R8: Missing class
# com.ditchoom.buffer.BufferFactoryJvm (referenced from:
# com.funkatronics.buffer.PlatformByteBuffer.order(...))"). Since the class
# does not exist on this classpath at all, it could never be loaded at
# runtime on Android either - -dontwarn (not -keep, which cannot keep a
# class that isn't there) is R8's own documented remedy for exactly this.
-dontwarn com.funkatronics.buffer.**
-dontwarn com.ditchoom.buffer.**
