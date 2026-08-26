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
            // Include 32-bit ARM so release APKs install on older/budget phones.
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86_64")
        }
    }

    buildFeatures {
        compose = true
    }
}

chaquopy {
    defaultConfig {
        version = "3.10"
        buildPython("C:/Users/Lenovo/AppData/Roaming/uv/python/cpython-3.10.20-windows-x86_64-none/python.exe")
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
