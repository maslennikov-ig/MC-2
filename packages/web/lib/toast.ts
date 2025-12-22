/**
 * Centralized toast utility
 * Re-exports sonner toast for consistent usage
 */
import { toast as sonnerToast } from 'sonner'

export const toast = sonnerToast

export function showError(message: string, description?: string): void {
  toast.error(message, description ? { description } : undefined)
}

export function showSuccess(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined)
}

export function showWarning(message: string, description?: string): void {
  toast.warning(message, description ? { description } : undefined)
}

export function showInfo(message: string, description?: string): void {
  toast.info(message, description ? { description } : undefined)
}
