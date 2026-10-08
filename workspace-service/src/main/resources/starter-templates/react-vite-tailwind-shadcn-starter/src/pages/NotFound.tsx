import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted text-foreground">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">This page does not exist.</p>
        <Button asChild>
          <Link to="/">Back to the home page</Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
