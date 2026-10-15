/**
 * The entry route: the sign-in page for visitors, the workspace for everyone signed in.
 *
 * Handles: sending a signed-in person straight to their projects, and everyone else to /login. Kept eagerly loaded,
 * since it is what the very first paint renders.
 */
import { Navigate } from "react-router-dom";
import { isAuthenticated } from "@/lib/api";

const Index = () => <Navigate to={isAuthenticated() ? "/projects" : "/login"} replace />;

export default Index;
