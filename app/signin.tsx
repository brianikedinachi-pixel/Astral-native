import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { cn } from "@/lib/utils";

const BACKEND_URL = "https://astral-1-sb1i.onrender.com";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    try {
      // Check if email is in allowed users list
      const allowedResponse = await fetch(`${BACKEND_URL}/allowed-users`);
      if (!allowedResponse.ok) {
        throw new Error("Could not verify access");
      }
      const allowedData = await allowedResponse.json();
      const allowedEmails = allowedData.emails || [];

      if (!allowedEmails.includes(email.trim())) {
        throw new Error("Email not approved for access. Contact the administrator.");
      }

      // Create session
      const session = {
        email: email.trim(),
        name: name.trim(),
        user_id: `user_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`,
        created_at: Date.now(),
      };
      await AsyncStorage.setItem("astral_session", JSON.stringify(session));

      // Initialize user profile
      const existingUsers = await AsyncStorage.getItem("astral_users");
      const users = existingUsers ? JSON.parse(existingUsers) : {};
      users[email.trim()] = {
        ...session,
        messageCount: 0,
        imageCount: 0,
        conversationCount: 0,
        memberSince: Date.now(),
      };
      await AsyncStorage.setItem("astral_users", JSON.stringify(users));

      // Redirect to chat
      router.replace("/chat");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      Alert.alert("Sign In Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        className="flex-1"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center items-center px-6 py-8">
          {/* Brand */}
          <View className="items-center mb-12">
            <Text className="text-5xl font-black text-primary mb-2">
              Astral
            </Text>
            <Text className="text-sm text-muted italic">
              Your AI Companion for Support & Guidance
            </Text>
          </View>

          {/* Card */}
          <View
            className={cn(
              "w-full max-w-sm",
              "bg-surface rounded-3xl p-8",
              "border border-border"
            )}
          >
            <Text className="text-lg font-bold text-primary mb-1">
              Sign in to Astral
            </Text>
            <Text className="text-xs text-muted mb-6 leading-relaxed">
              Your chats are private and saved just for you.
            </Text>

            {/* Loading State */}
            {loading && (
              <View className="flex-row items-center justify-center gap-2 py-3 mb-4">
                <ActivityIndicator color="#00e5ff" size="small" />
                <Text className="text-xs text-muted">Checking access…</Text>
              </View>
            )}

            {/* Error Message */}
            {error ? (
              <View className="bg-error/10 border border-error/30 rounded-xl p-3 mb-4">
                <Text className="text-xs text-error leading-relaxed">
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Email Input */}
            <View className="mb-3">
              <Text className="text-xs font-semibold text-muted uppercase mb-1.5 tracking-wider">
                Email Address
              </Text>
              <TextInput
                placeholder="you@gmail.com"
                placeholderTextColor="#3a5a78"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
                className={cn(
                  "w-full px-4 py-3 rounded-2xl",
                  "bg-background/50 border border-primary/20",
                  "text-foreground text-sm"
                )}
              />
            </View>

            {/* Name Input */}
            <View className="mb-6">
              <Text className="text-xs font-semibold text-muted uppercase mb-1.5 tracking-wider">
                Your Name
              </Text>
              <TextInput
                placeholder="e.g. Brian"
                placeholderTextColor="#3a5a78"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
                className={cn(
                  "w-full px-4 py-3 rounded-2xl",
                  "bg-background/50 border border-primary/20",
                  "text-foreground text-sm"
                )}
              />
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              onPress={handleSignIn}
              disabled={loading}
              className={cn(
                "w-full py-3 rounded-2xl",
                "bg-gradient-to-r from-primary to-purple-600",
                "active:opacity-90",
                loading && "opacity-60"
              )}
            >
              <Text className="text-center font-bold text-background text-sm">
                {loading ? "Signing in…" : "Sign In →"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View className="mt-8 text-center">
            <Text className="text-xs text-muted/50 leading-relaxed">
              Created by Nweze-Ukanwoko Brian Chiemerie
              {"\n"}
              Built with care for those who need support
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
