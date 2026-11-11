# R8 removes classes of CameraX and ML Kit that are only looked up at runtime, so the scanner of the release APK says
# "Unable to start camera: genericError". It works with minify off and not with it on (shown on 2026-11-11 on two phones).
# These rules keep what the scanner needs: the classes of mobile_scanner, of CameraX and of ML Kit barcode scanning.
# (Renaming a class is fine; what must not happen is that it is removed. The rules keep the names too, which is the plainest.)
# Read by the build: the Flutter Gradle plugin adds android/app/proguard-rules.pro to the release build when the file exists.

-keep class dev.steenbakker.mobile_scanner.** { *; }

-keep class androidx.camera.** { *; }
-keep interface androidx.camera.** { *; }

-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-keep class com.google.android.odml.** { *; }

-dontwarn androidx.camera.**
-dontwarn com.google.mlkit.**
