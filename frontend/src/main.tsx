/**
 * The browser entry point.
 *
 * Handles: mounting the app into the page and pulling in the global stylesheet, the menu highlight glide
 * (lib/menu-glide.ts) and the buttons' pointer-following light (lib/button-light.ts).
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installMenuGlide } from "./lib/menu-glide";
import { installButtonLight } from "./lib/button-light";

installMenuGlide();
installButtonLight();

createRoot(document.getElementById("root")!).render(<App />);
