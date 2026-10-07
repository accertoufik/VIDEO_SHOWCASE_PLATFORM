import type { NativeStackNavigationOptions } from "expo-router";
import { colors } from "@/css";

// Shared by every Stack: no native header (screens draw their own), a dark canvas so transitions never flash a light
// colour, and one explicit slide animation. The Android default is a fade-from-bottom whose brief see-through frame is
// what showed up as a "flash" when the phone's Back button was pressed.
export const stackScreenOptions: NativeStackNavigationOptions = {
    headerShown: false,
    animation: "slide_from_right",
    animationDuration: 220,
    contentStyle: { backgroundColor: colors.background.primary },
}
