import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'icon';
}

export function Button({
  className,
  variant = 'ghost',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      className={twMerge(
        clsx(
          'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
          'disabled:opacity-40 disabled:pointer-events-none',
          variant === 'primary' &&
            'bg-accent text-white hover:bg-accent-muted shadow-glow',
          variant === 'ghost' && 'text-white/80 hover:bg-white/8 hover:text-white',
          variant === 'outline' &&
            'border border-white/12 text-white/80 hover:bg-white/6',
          size === 'sm' && 'px-2.5 py-1.5 text-xs',
          size === 'md' && 'px-3 py-2 text-sm',
          size === 'icon' && 'p-2'
        ),
        className
      )}
      {...props}
    />
  );
}
