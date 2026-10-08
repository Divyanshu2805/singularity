package com.singularity.intelligence.llm;

import java.util.Collection;

/**
 * Which component kit a project is built on.
 *
 * <p>Handles: naming the two kits a project can have, and telling which one a project has from the paths of its
 * files.
 *
 * <p>New projects start from the shadcn/ui starter template; projects created before it are daisyUI. The build
 * prompt has to describe the project it is about to change, so the kit is read off the project itself - whether the
 * kit's button is where the template puts it - and never assumed from when the project was made. A project with no
 * files yet is about to become whatever the model is told, so it is told the current kit.
 */
public enum UiKit {
    SHADCN,
    DAISYUI;

    public static final String KIT_FOLDER = "src/components/ui/";
    static final String SHADCN_MARKER = KIT_FOLDER + "button.tsx";

    public static UiKit of(Collection<String> projectPaths) {
        if (projectPaths == null || projectPaths.isEmpty() || projectPaths.contains(SHADCN_MARKER)) {
            return SHADCN;
        }
        return DAISYUI;
    }
}
