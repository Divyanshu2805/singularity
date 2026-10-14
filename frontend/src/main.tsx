/**
 * The browser entry point.
 *
 * Handles: mounting the app into the page and pulling in the global stylesheet, the menu highlight glide
 * (lib/menu-glide.ts), the buttons' pointer-following light (lib/button-light.ts), and closing open menus when a
 * press lands in a frame such as the live preview (lib/frame-focus.ts).
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installMenuGlide } from "./lib/menu-glide";
import { installButtonLight } from "./lib/button-light";
import { closeMenusWhenAFrameTakesFocus } from "./lib/frame-focus";

installMenuGlide();
installButtonLight();
closeMenusWhenAFrameTakesFocus();

createRoot(document.getElementById("root")!).render(<App />);
