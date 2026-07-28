/**
 * Asks what to call the copy, forks the project, and opens it.
 *
 * Handles: the name field with the backend's own length limit, the request, and reporting a refusal in place.
 *
 * The copy has every file but starts with a fresh chat, and the person forking owns it - nothing they do there
 * reaches the original, and nothing done to the original reaches them.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { GitFork, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

const MAX_NAME_LENGTH = 255;

export function ForkProjectDialog({ project, onOpenChange }: {
  project: { id: number | string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [isForking, setIsForking] = useState(false);

  useEffect(() => {
    if (project) {
      setName(`${project.name} (fork)`.slice(0, MAX_NAME_LENGTH));
      setIsForking(false);
    }
  }, [project]);

  const fork = async (e: FormEvent) => {
    e.preventDefault();
    if (!project || isForking) return;
    setIsForking(true);
    try {
      const forked = await api.forkProject(String(project.id), name.trim());
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project forked", description: `“${forked.name}” is your own copy - you're its owner.` });
      onOpenChange(false);
      navigate(`/projects/${forked.id}`);
    } catch (error) {
      toast({
        title: "Couldn't fork project",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      setIsForking(false);
    }
  };

  return (
    <Dialog open={!!project} onOpenChange={(open) => !isForking && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={fork} className="grid gap-4">
          <DialogHeader>
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <GitFork className="h-4 w-4" />
            </div>
            <DialogTitle>Fork this project?</DialogTitle>
            <DialogDescription>
              You&rsquo;ll get your own copy of every file and become its owner. The chat starts fresh, and changes
              in either project never affect the other.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Name for your copy"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            disabled={isForking}
            onChange={(e) => setName(e.target.value)}
            className="text-center"
          />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isForking} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isForking || !name.trim()} className="gap-1.5">
              {isForking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitFork className="h-3.5 w-3.5" />}
              {isForking ? "Forking…" : "Fork project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
