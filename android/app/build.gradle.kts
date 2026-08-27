plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.chaquo.python")
}

android {
    namespace = "org.liethueis.televault"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.liethueis.televault"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        ndk {
            // Chaquopy + Python 3.12 only supports 64-bit ABIs (arm64-v8a, x86_64).
            // Python 3.12 is not available for armeabi-v7a/x86 - build fails if included.
            // This covers 99%+ of modern devices; Play Store requires 64-bit anyway.
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    buildFeatures {
        compose = true
    }
}

chaquopy {
    defaultConfig {
        version = "3.12"
        buildPython("C:/Python312/python.exe") // Change to your local Python 3.12 path, e.g. "C:/Users/YOURNAME/AppData/Local/Programs/Python/Python312/python.exe"
        pip {
            install("-r", "requirements.txt")
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.12.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.runtime:runtime")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    // ExoPlayer (Media3) — the modern streaming engine behind Chrome/YouTube.
    // Far more robust than the legacy MediaPlayer for HTTP range streaming:
    // proper buffering, seek handling, built-in retry and clear diagnostics.
    implementation("androidx.media3:media3-exoplayer:1.6.1")
    implementation("androidx.media3:media3-ui:1.6.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
