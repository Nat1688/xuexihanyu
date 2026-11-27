const paths = {
  dictionary: 'M3 3h12v18H3z M6 7h6 M6 11h3 M15 7a4 4 0 1 1 0 8 M18 14l4 4',
  specialties: 'M3 7h18v14H3z M8 7V3h8v4 M3 13h18 M10 11v4h4v-4',
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  curriculum: 'M12 5v15 M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-2-1-6-2-10 1Z',
  assign: 'M8 4H5v17h14V4h-3 M8 2h8v4H8z M8 11h8 M8 16h5',
  admissions:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M16 10l2 2 4-4',
  home: 'M3 11 12 3l9 8 M5 10v11h5v-7h4v7h5V10',
  classes: 'M3 4h18v11H3z M8 21l4-6 4 6 M7 8h10 M7 11h6',
  progress: 'M4 3v17h17 M8 15l4-5 4 2 5-7 M17 5h4v4',
  flashcards: 'M7 3h14v16H7z M3 7v14h14 M11 8h6 M11 12h4',
  selfStudy:
    'M12 4v16 M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-2-1-6-2-10 1 M5 8l4 1 M15 9l4-1',
  back: 'M11 5 4 12l7 7 M4 12h16',
  tools: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M17 14v6 M14 17h6',
};
export function TeacherNavIcon({ name }: { name: keyof typeof paths }) {
  return (
    <span className={`ink-nav-icon ink-nav-icon--${name}`} aria-hidden="true">
      <svg
        aria-hidden="true"
        focusable="false"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={paths[name]} />
      </svg>
    </span>
  );
}
