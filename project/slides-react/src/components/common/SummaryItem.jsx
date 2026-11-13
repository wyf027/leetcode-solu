import { SurfaceIcon } from './SurfaceIcon.jsx';
import { CaretRight } from '@phosphor-icons/react';
function SummaryItem({ icon, title, value }) {
  return (
    <div className="summary-row">
      <SurfaceIcon>{icon}</SurfaceIcon>
      <div>
        <strong>{title}</strong>
        <span>{value}</span>
      </div>
      <CaretRight size={18} weight="bold" aria-hidden="true" />
    </div>
  );
}
export { SummaryItem };
