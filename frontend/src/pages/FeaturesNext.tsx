/**
 * The home page with the next version of its features section, for the owner to compare against the live one.
 *
 * Handles: showing pages/Home.tsx exactly as it is at the root, except that the features are the version waiting for
 * approval (components/landing/FeatureChapters.next.tsx - the cards standing on a sheet of space-time, one film at a
 * time, the chapter being read lit), so it is judged in its place on the page, between the sections round it,
 * while the root keeps the version already there. Registered in development only, at /features-next (App.tsx). Once
 * the owner has chosen, the chosen version becomes FeatureChapters.tsx and this page and its route are removed.
 */
import { FeatureChapters } from "@/components/landing/FeatureChapters.next";
import Home from "./Home";

export default function FeaturesNext() {
  return <Home features={<FeatureChapters />} />;
}
