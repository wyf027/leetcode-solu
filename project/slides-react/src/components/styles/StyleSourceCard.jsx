import { SurfaceIcon } from '../common/SurfaceIcon.jsx';
import { CheckCircle } from '@phosphor-icons/react';
function StyleSourceCard({
  active,
  title,
  description,
  icon,
  meta,
  actionLabel,
  activeActionLabel,
  tone,
  onClick,
}) {
  return (
    <button
      className={`source-card source-card--${tone}${active ? ' is-active' : ''}`}
      type="button"
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="source-card__content">
        <span className="source-card__leading" aria-hidden="true">
          <span className="selection-dot">{active && <span />}</span>
          <SurfaceIcon>{icon}</SurfaceIcon>
        </span>
        <span className="source-card__copy">
          <span className="source-card__heading">
            <strong>{title}</strong>
            {meta && <span className="source-card__meta">{meta}</span>}
          </span>
          <span>{description}</span>
        </span>
      </span>
      <span className="source-card__action">
        {active && <CheckCircle size={18} weight="fill" />}
        {active ? activeActionLabel : actionLabel}
      </span>
    </button>
  );
}
export { StyleSourceCard };
