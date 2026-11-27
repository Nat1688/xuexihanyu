import { TeacherNavIcon } from './teacher/TeacherNavIcon';

/** Presentation only: the caller owns navigation and pending-submission guards. */
export function StudentReturn({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Tổng quan học tập"
      className="clp-button ink-student-return"
      onClick={onClick}
      disabled={disabled}
    >
      <TeacherNavIcon name="back" />
      <span>
        <strong>Tổng quan học tập</strong>
        <span>Lớp học · Bài được giao · Tiến độ</span>
      </span>
    </button>
  );
}
