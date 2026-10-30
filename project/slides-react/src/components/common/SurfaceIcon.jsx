function SurfaceIcon({ children, tone = 'violet' }) {
  return <span className={`surface-icon surface-icon--${tone}`}>{children}</span>;
}
export { SurfaceIcon };
