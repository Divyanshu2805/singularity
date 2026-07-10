import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useProjectPreferences } from "@/hooks/use-project-preferences";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { ProjectSummaryResponse } from "@/lib/types";
import { deleteCopy } from "@/lib/project-delete";
import { ForkProjectDialog } from "@/components/ForkProjectDialog";

/** Download, pin, star, and confirm-then-delete for project lists. Render `deleteDialog` once in the page. */
export function useProjectActions({ onDeleted }: { onDeleted?: (project: ProjectSummaryResponse) => void } = {}) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [projectToDelete, setProjectToDelete] = useState<ProjectSummaryResponse | null>(null);
    const [projectToFork, setProjectToFork] = useState<ProjectSummaryResponse | null>(null);
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const preferences = useProjectPreferences();

    const downloadProject = async (project: ProjectSummaryResponse) => {
        try {
            const blob = await api.downloadProjectZip(String(project.id));
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project.name.replace(/[^\w.-]+/g, "-")}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            toast({
                title: "Couldn't download project",
                description: error instanceof Error ? error.message : undefined,
                variant: "destructive",
            });
        }
    };

    const deleteProject = async () => {
        if (!projectToDelete) return;
        const copy = deleteCopy(projectToDelete.role, projectToDelete.name);
        try {
            await api.deleteProject(String(projectToDelete.id));
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            toast({ title: copy.doneTitle });
            onDeleted?.(projectToDelete);
        } catch (error) {
            toast({
                title: copy.failTitle,
                description: error instanceof Error ? error.message : undefined,
                variant: "destructive",
            });
        } finally {
            setProjectToDelete(null);
        }
    };

    /** Renames at once in every project list, and puts the old name back if the server refuses. */
    const renameProject = async (project: ProjectSummaryResponse, name: string) => {
        const previous = queryClient.getQueryData<ProjectSummaryResponse[]>(["projects"]);
        queryClient.setQueryData<ProjectSummaryResponse[]>(["projects"], (projects) =>
            projects?.map((p) => (p.id === project.id ? { ...p, name } : p))
        );
        try {
            await api.updateProject(String(project.id), name);
            return true;
        } catch (error) {
            queryClient.setQueryData(["projects"], previous);
            toast({
                title: "Couldn't rename project",
                description: error instanceof Error ? error.message : undefined,
                variant: "destructive",
            });
            return false;
        } finally {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    };

    /** Turns one card/row into its inline rename field - only one project renames at a time. */
    const startRename = (project: ProjectSummaryResponse) => setRenamingId(project.id);

    /** `null` means the rename was cancelled (blank, unchanged, or Escape) - nothing is sent either way. */
    const finishRename = (project: ProjectSummaryResponse, name: string | null) => {
        setRenamingId(null);
        if (name) renameProject(project, name);
    };

    const deleteDialog = (
        <AlertDialog open={projectToDelete !== null} onOpenChange={(open) => !open && setProjectToDelete(null)}>
            <AlertDialogContent className="sm:max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>{deleteCopy(projectToDelete?.role, projectToDelete?.name).title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {deleteCopy(projectToDelete?.role, projectToDelete?.name).description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteProject} className={buttonVariants({ variant: "destructive" })}>
                        {deleteCopy(projectToDelete?.role, projectToDelete?.name).confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    return {
        downloadProject,
        renameProject,
        isRenaming: (project: ProjectSummaryResponse) => renamingId === project.id,
        startRename,
        finishRename,
        requestDelete: setProjectToDelete,
        deleteDialog,
        requestFork: setProjectToFork,
        forkDialog: <ForkProjectDialog project={projectToFork} onOpenChange={(open) => !open && setProjectToFork(null)} />,
        ...preferences,
    };
}
