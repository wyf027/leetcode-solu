import React from 'react';
import { Desktop, Moon, Sun } from '@phosphor-icons/react';
function Appearance() {
  const [theme, setTheme] = React.useState(() => {
    try {
      return localStorage.getItem('slides-theme') || 'system';
    } catch {
      return 'system';
    }
  });
  React.useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (preference.matches ? 'dark' : 'light') : theme;
    };
    apply();
    preference.addEventListener('change', apply);
    try {
      localStorage.setItem('slides-theme', theme);
    } catch {
      /* Optional preference. */
    }
    return () => preference.removeEventListener('change', apply);
  }, [theme]);
  return (
    <div className="appearance-toolbar" aria-label="外观设置">
      {[
        ['system', Desktop, '跟随系统'],
        ['light', Sun, '浅色'],
        ['dark', Moon, '深色'],
      ].map(([value, Icon, title]) => (
        <button
          type="button"
          key={value}
          title={title}
          aria-label={title}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon size={17} />
        </button>
      ))}
    </div>
  );
}
export { Appearance };
