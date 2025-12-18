import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Label } from "./label"
import { Input } from "./input"
import { AlertCircle, CheckCircle, Info } from "lucide-react"

// Form field container with consistent spacing and layout
const formFieldVariants = cva(
  "space-y-2",
  {
    variants: {
      variant: {
        default: "",
        compact: "space-y-1",
        spacious: "space-y-3",
      }
    },
    defaultVariants: {
      variant: "default",
    }
  }
)

interface FormFieldProps extends VariantProps<typeof formFieldVariants> {
  label?: string
  description?: string
  error?: string
  success?: string
  info?: string
  required?: boolean
  children: React.ReactNode
  className?: string
  labelClassName?: string
  htmlFor?: string
}

export function FormField({
  label,
  description,
  error,
  success,
  info,
  required,
  children,
  className,
  labelClassName,
  htmlFor,
  variant,
}: FormFieldProps) {
  const generatedId = React.useId()
  const fieldId = htmlFor || generatedId

  return (
    <div className={cn(formFieldVariants({ variant, className }))}>
      {label && (
        <Label 
          htmlFor={fieldId}
          className={cn(
            "block text-sm font-medium",
            error && "text-destructive",
            success && "text-[hsl(var(--success))]",
            labelClassName
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      
      <div className="relative">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            const childProps = child.props as { className?: string } & Record<string, unknown>
            return React.cloneElement(child, {
              id: fieldId,
              'aria-invalid': !!error,
              'aria-describedby': cn(
                error && `${fieldId}-error`,
                success && `${fieldId}-success`,
                info && `${fieldId}-info`,
                description && `${fieldId}-description`
              ).trim() || undefined,
              className: cn(
                childProps.className,
                error && "border-destructive focus-visible:ring-destructive/20",
                success && "border-[hsl(var(--success))] focus-visible:ring-[hsl(var(--success))]/20"
              )
            } as React.HTMLAttributes<unknown>)
          }
          return child
        })}
      </div>
      
      {/* Feedback messages */}
      {error && (
        <div 
          id={`${fieldId}-error`}
          className="flex items-center gap-1 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {success && !error && (
        <div 
          id={`${fieldId}-success`}
          className="flex items-center gap-1 text-xs text-[hsl(var(--success))]"
        >
          <CheckCircle className="h-3 w-3 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}
      
      {info && !error && !success && (
        <div 
          id={`${fieldId}-info`}
          className="flex items-center gap-1 text-xs text-[hsl(var(--info))]"
        >
          <Info className="h-3 w-3 flex-shrink-0" />
          <span>{info}</span>
        </div>
      )}
    </div>
  )
}

// Specific input field component with validation
interface InputFieldProps extends Omit<React.ComponentProps<typeof Input>, 'error' | 'success' | 'variant'> {
  label?: string
  description?: string
  error?: string
  success?: string
  info?: string
  required?: boolean
  variant?: VariantProps<typeof formFieldVariants>['variant']
  containerClassName?: string
  labelClassName?: string
}

export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ 
    label, 
    description, 
    error, 
    success, 
    info, 
    required, 
    variant,
    containerClassName,
    labelClassName,
    ...props 
  }, ref) => {
    return (
      <FormField
        label={label}
        description={description}
        error={error}
        success={success}
        info={info}
        required={required}
        variant={variant}
        className={containerClassName}
        labelClassName={labelClassName}
        htmlFor={props.id}
      >
        <Input ref={ref} {...props} />
      </FormField>
    )
  }
)
InputField.displayName = "InputField"

// Textarea field component
interface TextareaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  description?: string
  error?: string
  success?: string
  info?: string
  required?: boolean
  variant?: VariantProps<typeof formFieldVariants>['variant']
  containerClassName?: string
  labelClassName?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export const TextareaField = React.forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ 
    label, 
    description, 
    error, 
    success, 
    info, 
    required, 
    variant,
    containerClassName,
    labelClassName,
    ...props 
  }, ref) => {
    return (
      <FormField
        label={label}
        description={description}
        error={error}
        success={success}
        info={info}
        required={required}
        variant={variant}
        className={containerClassName}
        labelClassName={labelClassName}
        htmlFor={props.id}
      >
        <Textarea ref={ref} {...props} />
      </FormField>
    )
  }
)
TextareaField.displayName = "TextareaField"

// Form section component for grouping related fields
interface FormSectionProps {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-lg font-medium leading-none">{title}</h3>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

// Helper hook for form validation
export function useFormValidation<T extends Record<string, unknown>>(
  initialErrors: Partial<Record<keyof T, string>> = {}
) {
  const [errors, setErrors] = React.useState<Partial<Record<keyof T, string>>>(initialErrors)
  const [touched, setTouched] = React.useState<Partial<Record<keyof T, boolean>>>({})

  const setFieldError = (field: keyof T, error: string | undefined) => {
    setErrors(prev => ({ ...prev, [field]: error }))
  }

  const setFieldTouched = (field: keyof T, isTouched = true) => {
    setTouched(prev => ({ ...prev, [field]: isTouched }))
  }

  const clearErrors = () => {
    setErrors({})
    setTouched({})
  }

  const getFieldError = (field: keyof T) => {
    return touched[field] ? errors[field] : undefined
  }

  const hasErrors = Object.values(errors).some(error => !!error)

  return {
    errors,
    touched,
    setFieldError,
    setFieldTouched,
    clearErrors,
    getFieldError,
    hasErrors,
    setErrors,
  }
}