/**
 * The pin and star toggles.
 *
 * Handles: updating the project lists immediately and rolling the change back if the server refuses, so the list
 * never sits showing something that did not happen.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { ProjectSummaryResponse } from "@/lib/types";

type PreferenceField = "pinnedAt" | "starredAt";

export function useProjectPreferences() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const update = async (project: ProjectSummaryResponse, field: PreferenceField, enable: boolean) => {
        const previous = queryClient.getQueryData<ProjectSummaryResponse[]>(["projects"]);
        queryClient.setQueryData<ProjectSummaryResponse[]>(["projects"], (projects) =>
            projects?.map((p) => (p.id === project.id ? { ...p, [field]: enable ? new Date().toISOString() : null } : p))
        );
        try {
            if (field === "pinnedAt") await api.setProjectPinned(String(project.id), enable);
            else await api.setProjectStarred(String(project.id), enable);
        } catch (error) {
            queryClient.setQueryData(["projects"], previous);
            toast({
                title: field === "pinnedAt" ? "Couldn't update pin" : "Couldn't update star",
                description: error instanceof Error ? error.message : undefined,
                variant: "destructive",
            });
        } finally {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    };

    return {
        togglePin: (project: ProjectSummaryResponse) => update(project, "pinnedAt", !project.pinnedAt),
        toggleStar: (project: ProjectSummaryResponse) => update(project, "starredAt", !project.starredAt),
    };
}
