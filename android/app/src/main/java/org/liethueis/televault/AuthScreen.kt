package org.liethueis.televault

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Password
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

private enum class AuthStep(val title: String, val subtitle: String) {
    SETUP(
        "Connect your Telegram API credentials",
        "TeleVault uses your own Telegram API ID and hash to create a private encrypted vault session on this device.",
    ),
    PHONE(
        "Verify your Telegram account",
        "Enter the phone number connected to the Telegram account you want to use for encrypted storage.",
    ),
    CODE(
        "Enter the login code",
        "Telegram sent a sign-in code to your account. TeleVault stores the resulting session locally.",
    ),
    PASSWORD(
        "Unlock two-step verification",
        "Your Telegram account has a cloud password enabled. Enter it to finish the local session setup.",
    ),
}

@Composable
fun AuthScreen(engine: TeleVaultEngine, onConnected: () -> Unit, onMessage: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(AuthStep.SETUP) }

    var apiId by remember { mutableStateOf("") }
    var apiHash by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var showHelp by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        // Decorative gradient blob.
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .size(280.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Spacer(Modifier.height(16.dp))

            // Logo
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(RoundedCornerShape(26.dp))
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(44.dp),
                )
            }

            Spacer(Modifier.height(18.dp))
            Text(
                "TeleVault",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                "Encrypted cloud storage on Telegram",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(28.dp))

            // Step indicator
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AuthStep.entries.forEach { s ->
                    val active = step == s
                    val done = s.ordinal < step.ordinal
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(
                                when {
                                    active -> MaterialTheme.colorScheme.primary
                                    done -> MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)
                                    else -> MaterialTheme.colorScheme.surfaceContainerHighest
                                },
                            ),
                    )
                }
            }
            Spacer(Modifier.height(20.dp))

            AnimatedContent(targetState = step, label = "authStep") { current ->
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        current.title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        current.subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(20.dp))

                    when (current) {
                        AuthStep.SETUP -> SetupFields(
                            apiId = apiId,
                            onApiId = { apiId = it },
                            apiHash = apiHash,
                            onApiHash = { apiHash = it },
                            onHelp = { showHelp = true },
                        )
                        AuthStep.PHONE -> OutlinedTextField(
                            value = phone,
                            onValueChange = { phone = it },
                            label = { Text("Phone number") },
                            leadingIcon = { Icon(Icons.Outlined.Phone, contentDescription = null) },
                            placeholder = { Text("+1 234 567 8900") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AuthStep.CODE -> OutlinedTextField(
                            value = code,
                            onValueChange = { code = it },
                            label = { Text("Login code") },
                            leadingIcon = { Icon(Icons.Outlined.Smartphone, contentDescription = null) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AuthStep.PASSWORD -> OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Two-step password") },
                            leadingIcon = { Icon(Icons.Outlined.Password, contentDescription = null) },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    Spacer(Modifier.height(24.dp))

                    val canProceed = when (current) {
                        AuthStep.SETUP -> apiId.isNotBlank() && apiHash.trim().length >= 32
                        AuthStep.PHONE -> phone.trim().isNotBlank()
                        AuthStep.CODE -> code.isNotBlank()
                        AuthStep.PASSWORD -> password.isNotBlank()
                    }

                    Button(
                        onClick = {
                            busy = true
                            scope.launch {
                                try {
                                    when (current) {
                                        AuthStep.SETUP -> {
                                            step = AuthStep.PHONE
                                        }
                                        AuthStep.PHONE -> {
                                            engine.requestCode(phone, apiId, apiHash)
                                            step = AuthStep.CODE
                                        }
                                        AuthStep.CODE -> {
                                            val result = engine.signIn(code)
                                            if (result.optString("next_step") == "password") {
                                                step = AuthStep.PASSWORD
                                            } else {
                                                onConnected()
                                            }
                                        }
                                        AuthStep.PASSWORD -> {
                                            engine.checkPassword(password)
                                            onConnected()
                                        }
                                    }
                                } catch (e: Exception) {
                                    onMessage(e.message ?: "Something went wrong")
                                }
                                busy = false
                            }
                        },
                        enabled = canProceed && !busy,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        if (busy) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(22.dp),
                                strokeWidth = 2.5.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text(
                                when (current) {
                                    AuthStep.SETUP -> "Continue"
                                    AuthStep.PHONE -> "Send code"
                                    AuthStep.CODE -> "Sign in"
                                    AuthStep.PASSWORD -> "Unlock"
                                },
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }

                    if (current != AuthStep.SETUP) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { step = AuthStep.entries[current.ordinal - 1] },
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.size(8.dp))
                            Text("Back")
                        }
                    }
                }
            }

            Spacer(Modifier.height(28.dp))
            Text(
                "Your files stay encrypted on your device. Even Telegram cannot read them.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (showHelp) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showHelp = false },
            icon = { Icon(Icons.Outlined.HelpOutline, contentDescription = null) },
            title = { Text("Where do I find my API ID & hash?") },
            text = {
                Text(
                    "Open my.telegram.org → API development tools. " +
                        "Your api_id is a number and api_hash is a 32-character string. " +
                        "Enter the phone number that owns this Telegram account, then press " +
                        "\u201CRequest login code\u201D.",
                )
            },
            confirmButton = {
                Button(onClick = { showHelp = false }) { Text("Got it") }
            },
        )
    }
}

@Composable
private fun SetupFields(
    apiId: String,
    onApiId: (String) -> Unit,
    apiHash: String,
    onApiHash: (String) -> Unit,
    onHelp: () -> Unit,
) {
    OutlinedTextField(
        value = apiId,
        onValueChange = { onApiId(it.filter { c -> c.isDigit() }.take(9)) },
        label = { Text("Telegram API ID") },
        leadingIcon = { Icon(Icons.Outlined.Shield, contentDescription = null) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(
        value = apiHash,
        onValueChange = { onApiHash(it.take(32)) },
        label = { Text("Telegram API hash") },
        leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(12.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            "Where do I find these?",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onHelp)
                .padding(vertical = 4.dp, horizontal = 2.dp),
        )
        Spacer(Modifier.weight(1f))
    }
}
