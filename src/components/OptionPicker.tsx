import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface OptionPickerItem<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function OptionPicker<T extends string>({
  value,
  options,
  label,
  onChange,
  triggerRef,
}: {
  value: T;
  options: OptionPickerItem<T>[];
  label: string;
  onChange: (value: T) => void;
  triggerRef?: (element: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number }>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value) ?? options[0];

  const positionMenu = () => {
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const margin = 12;
    const width = Math.min(Math.max(bounds.width, 280), window.innerWidth - margin * 2, 420);
    const preferredHeight = Math.min(420, window.innerHeight - margin * 2);
    const top = Math.max(margin, Math.min(bounds.bottom + 6, window.innerHeight - preferredHeight - margin));
    const left = Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin));
    setMenuPosition({ top, left, width, maxHeight: window.innerHeight - top - margin });
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    const reposition = () => positionMenu();
    positionMenu();
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const choose = (option: OptionPickerItem<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };

  const popup = open && menuPosition ? createPortal(
    <div ref={menu} className="option-picker-menu" role="listbox" aria-label={label} style={menuPosition}>
      {options.map(option => <button
        type="button"
        className={`option-picker-option ${value === option.value ? 'selected' : ''}`}
        role="option"
        aria-selected={value === option.value}
        disabled={option.disabled}
        key={option.value}
        onClick={() => choose(option)}
      >
        <span className="option-picker-check" aria-hidden="true">{value === option.value ? '✓' : ''}</span>
        <span><b>{option.label}</b>{option.description && <small>{option.description}</small>}</span>
      </button>)}
    </div>,
    document.body,
  ) : null;

  return <>
    <div className="option-picker" ref={root}>
      <button
        ref={element => {
          trigger.current = element;
          triggerRef?.(element);
        }}
        type="button"
        className="option-picker-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!open) positionMenu(); setOpen(current => !current); }}
        onKeyDown={event => {
          if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !open) {
            event.preventDefault();
            positionMenu();
            setOpen(true);
          }
        }}
      >
        <span><b>{selected?.label ?? value}</b></span>
        <span className="option-picker-chevron" aria-hidden="true">⌄</span>
      </button>
    </div>
    {popup}
  </>;
}
