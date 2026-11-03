// Íconos de trazo propio (24×24, trazo 1,75) para mantener un estilo consistente sin dependencias.

const PATHS = {
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15.25" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  routines: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 3.5h6v2H9zM9 10.5h6M9 14h6M9 17.5h3.5" />
    </>
  ),
  exercises: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  progress: <path d="M4 19.5h16M5.5 15.5l4-4.5 3 3 6-7" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  list: <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  chevron: <path d="M9.5 6l6 6-6 6" />,
  back: <path d="M14.5 6l-6 6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5M12 16h.01" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="M20.5 15.5l-4.5-4.5-8.5 8" />
    </>
  ),
  swap: <path d="M7 4.5L4 7.5l3 3M4 7.5h12M17 13.5l3 3-3 3M20 16.5H8" />,
  moon: <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" />,
  padel: (
    <>
      <circle cx="10" cy="9" r="5.5" />
      <path d="M13.5 13l5.5 5.5M8.5 8h.01M11.5 8h.01M10 10.5h.01" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  up: <path d="M12 19V5.5M6.5 11L12 5.5l5.5 5.5" />,
  down: <path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5" />,
  edit: <path d="M4.5 19.5l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3l-10 10-4 1.5zM13.5 7l3 3" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  external: <path d="M13.5 4.5h6v6M19.5 4.5L11 13M17 14v5.5H4.5V7H10" />,
  camera: (
    <>
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10.5H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
