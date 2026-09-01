import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const variants = cva('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary: 'bg-violet-600 text-white shadow-sm shadow-violet-200 hover:-translate-y-px hover:bg-violet-700',
      secondary: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
      ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    },
    size: { default: 'h-10 px-4', icon: 'size-9 p-0', sm: 'h-8 px-3 text-xs' }
  },
  defaultVariants: { variant: 'primary', size: 'default' }
})

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>
export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(variants({ variant, size }), className)} {...props} />)
Button.displayName = 'Button'
