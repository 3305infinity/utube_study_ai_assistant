import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  disabled?: boolean;
  badge?: string;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: TabsProps<T>) {
  return (
    <div
      className={twMerge(
        clsx(
          'flex gap-1 overflow-x-auto rounded-2xl bg-white/5 p-1 border border-white/8',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        ),
        className
      )}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) onChange(item.id);
            }}
            className={twMerge(
              clsx(
                'relative shrink-0 rounded-xl px-2.5 py-2 text-xs font-medium transition-all',
                'pointer-events-auto cursor-pointer select-none',
                active
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/55 hover:text-white/85 hover:bg-white/5',
                item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
              )
            )}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-1 rounded-md bg-accent/20 px-1 py-0.5 text-[10px] text-accent-muted">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
