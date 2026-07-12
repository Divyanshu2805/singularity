import { File, FileCode, FileJson, FileText, Image, type LucideIcon } from "lucide-react";

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function getFileIcon(name: string): LucideIcon {
  switch (extensionOf(name)) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "css":
    case "scss":
    case "html":
      return FileCode;
    case "json":
      return FileJson;
    case "md":
    case "txt":
      return FileText;
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "gif":
    case "webp":
      return Image;
    default:
      return File;
  }
}

export function getFileColor(name: string): string {
  switch (extensionOf(name)) {
    case "ts":
    case "tsx":
      return "text-sky-400";
    case "js":
    case "jsx":
      return "text-yellow-400";
    case "json":
      return "text-amber-400";
    case "css":
    case "scss":
      return "text-pink-400";
    case "html":
      return "text-orange-400";
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "gif":
    case "webp":
      return "text-violet-400";
    default:
      return "text-muted-foreground";
  }
}

export function splitPath(path: string): { dir: string; base: string } {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? { dir: "", base: path } : { dir: path.slice(0, slash + 1), base: path.slice(slash + 1) };
}
