# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# expo-notifications brings Firebase Messaging's optional KTX reference into
# the release graph; the app does not use Firebase KTX at runtime.
-dontwarn com.google.firebase.ktx.Firebase

# expo-modules-core's ReactActivityDelegateWrapper reflectively reads/writes
# these private RN core fields to wrap the app's entry point at startup.
# Without explicit keep rules R8 renames/strips them and the app crashes on
# launch with NoSuchFieldException (mDelegate / mReactDelegate).
-keepclassmembers class com.facebook.react.ReactActivity {
    private *** mDelegate;
}
-keepclassmembers class com.facebook.react.ReactActivityDelegate {
    private *** mReactDelegate;
}
