import React from 'react';
import { PAGE_OPTIONS } from '../../domain/pages.js';
import { CaretDown, Check, LockKey } from '@phosphor-icons/react';
function PagePolicySelect({ value, onChange, longPageAuthorized, onRequestAuthorization }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef(null);
  const selectedOption = PAGE_OPTIONS.find((option) => option.value === value) ?? PAGE_OPTIONS[0];
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);
  const selectOption = (option) => {
    if (option.requiresAuthorization && !longPageAuthorized) {
      setIsOpen(false);
      onRequestAuthorization();
      return;
    }
    onChange(option.value);
    setIsOpen(false);
  };
  return (
    <div className="page-policy-control" ref={containerRef}>
      <span id="page-policy-label">页数</span>
      <div className="page-policy-select">
        <button
          className={`page-policy-trigger${isOpen ? ' is-open' : ''}`}
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby="page-policy-label page-policy-value"
        >
          <span id="page-policy-value">{selectedOption.label}</span>
          <CaretDown size={14} weight="bold" aria-hidden="true" />
        </button>
        {isOpen && (
          <div className="page-policy-menu" role="listbox" aria-labelledby="page-policy-label">
            {PAGE_OPTIONS.map((option) => {
              const isLocked = option.requiresAuthorization && !longPageAuthorized;
              return (
                <button
                  key={option.value}
                  className={`page-policy-option${value === option.value ? ' is-selected' : ''}${isLocked ? ' is-locked' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => selectOption(option)}
                >
                  <span>{option.label}</span>
                  {isLocked && (
                    <span className="page-policy-option__authorization">
                      <LockKey size={14} weight="fill" />
                      需授权
                    </span>
                  )}
                  {!isLocked && value === option.value && (
                    <Check size={15} weight="bold" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
export { PagePolicySelect };
