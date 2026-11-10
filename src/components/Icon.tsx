type IconName = "projects" | "list" | "settings" | "folder" | "link" | "play" | "plus" | "search" | "pin";

const paths: Record<IconName, string> = {
  projects: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  list: "M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1",
  settings: "M4 6h16M4 12h16M4 18h16M9 3v6M15 9v6M9 15v6",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3ZM3 11h18",
  link: "m10 14 4-4m-5-2 2-2a4 4 0 0 1 6 6l-2 2m-6-4-2 2a4 4 0 0 0 6 6l2-2",
  play: "m9 5 11 7-11 7Z",
  plus: "M12 5v14M5 12h14",
  pin: "M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Zm3 11v7",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm5.5 13 5 5",
};

export default function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}><path d={paths[name]} /></svg>;
}
