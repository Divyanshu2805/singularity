/**
 * The signed-in person's round avatar: the picture their sign-in gave, or the first letter of their name.
 *
 * Handles: showing the profile picture kept at sign-in (lib/api's getUserPhoto - Google's, for a Google sign-in) inside
 * the gold ring (index.css, .avatar-ring), and falling back to the initial on the ring's gold when there is none or
 * the picture will not load. The picture is fetched with no referrer, which Google's picture host requires of a page
 * that is not its own, and it is allowed by the img-src of the page's content security policy (csp.ts).
 */
import { useState } from "react";
import { getUserPhoto } from "@/lib/api";
import { cn } from "@/lib/utils";

export function UserAvatar({ name, className }: { name?: string | null; className?: string }) {
    const photo = getUserPhoto();
    const [failed, setFailed] = useState<string | null>(null);
    const initial = name?.trim().charAt(0).toUpperCase() || "U";

    return (
        <span
            aria-hidden="true"
            className={cn("avatar-ring flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-primary-foreground", className)}
        >
            {photo && failed !== photo ? (
                <img
                    src={photo}
                    alt=""
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onError={() => setFailed(photo)}
                    className="h-full w-full object-cover"
                />
            ) : (
                initial
            )}
        </span>
    );
}
