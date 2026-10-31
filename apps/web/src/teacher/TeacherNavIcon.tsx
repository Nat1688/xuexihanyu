const paths = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  curriculum: 'M12 5v15 M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-2-1-6-2-10 1Z',
  assign: 'M8 4H5v17h14V4h-3 M8 2h8v4H8z M8 11h8 M8 16h5',
  admissions:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M16 10l2 2 4-4',
  tools: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M17 14v6 M14 17h6',
};
export function TeacherNavIcon({ name }: { name: keyof typeof paths }) {
  return (
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
  );
}
