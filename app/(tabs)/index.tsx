import { useEffect } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SignInScreen from "@/app/signin";

export default function HomeScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await AsyncStorage.getItem("astral_session");
        if (session && !cancelled) {
          router.replace("/chat");
        }
      } catch (err) {
        // Storage not available for some reason, stay on signin
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <SignInScreen />;
}
