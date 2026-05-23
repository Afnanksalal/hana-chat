"use client";

import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface PremiumSelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface PremiumSelectProps<T extends string> {
  label: string;
  value: T;
  options: Array<PremiumSelectOption<T>>;
  onChange: (value: T) => void;
}

export function PremiumSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: PremiumSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const fieldId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ??
    options[0] ?? { value, label: value };

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  return (
    <div className="premium-select-field" ref={rootRef}>
      <span className="field-label" id={`${fieldId}-label`}>
        {label}
      </span>
      <button
        aria-controls={`${fieldId}-listbox`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${fieldId}-label ${fieldId}-value`}
        className="premium-select-trigger"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
          }

          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <span id={`${fieldId}-value`}>{selected.label}</span>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isOpen ? (
        <div
          className="premium-select-menu premium-scroll"
          id={`${fieldId}-listbox`}
          role="listbox"
        >
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className="premium-select-option"
              key={option.value}
              role="option"
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span>{option.label}</span>
              <Check size={16} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
