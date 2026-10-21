import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import JourneyExperience from "@/components/journey/JourneyExperience";

const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif"
});

const mono = JetBrains_Mono({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Keep Going — a story told in particles",
  description: "An experimental particle landing page about falling down and getting up again."
};

export const viewport: Viewport = {
  themeColor: "#020203"
};

export default function JourneyPage() {
  return (
    <div className={`${serif.variable} ${mono.variable}`} style={{ background: "#020203", minHeight: "100vh" }}>
      <JourneyExperience />
    </div>
  );
}
