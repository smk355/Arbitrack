export default function PinIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        d="M12 21s-7-7.09-7-12a7 7 0 1 1 14 0c0 4.91-7 12-7 12z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
