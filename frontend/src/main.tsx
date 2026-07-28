/**
 * The browser entry point.
 *
 * Handles: mounting the app into the page and pulling in the global stylesheet.
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
