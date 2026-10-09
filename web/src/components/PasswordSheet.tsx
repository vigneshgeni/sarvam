import React, { useState, useEffect } from 'react'
import Sheet from './Sheet'
import { LockIcon, EyeIcon, CloseIcon } from './icons'

interface PasswordSheetProps {
  isOpen: boolean
  fileName?: string
  errorMsg?: string | null
  onUnlock: (password: string) => void
  onCancel: () => void
  t: Record<string, string>
}

export default function PasswordSheet({
  isOpen,
  fileName,
  errorMsg,
  onUnlock,
  onCancel,
  t,
}: PasswordSheetProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isShaking, setIsShaking] = useState(false)

  // Clear password when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setPassword('')
      setShowPassword(false)
      setIsShaking(false)
    }
  }, [isOpen])

  // Trigger shake on wrong password error
  useEffect(() => {
    if (errorMsg) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const isA11yReduced = document.documentElement.getAttribute('data-reduce-motion') === 'true'
      if (!prefersReduced && !isA11yReduced) {
        setIsShaking(true)
        const timer = setTimeout(() => setIsShaking(false), 500)
        return () => clearTimeout(timer)
      }
    }
  }, [errorMsg])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    onUnlock(password.trim())
  }

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onCancel}
      title={t.passwordRequiredTitle || 'This PDF is password protected'}
      maxHeight="max-h-[85vh]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFF4DE] text-[#9A6700] flex items-center justify-center shrink-0">
              <LockIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#15171A]">
                {t.passwordRequiredTitle || 'This PDF is password protected'}
              </h2>
              {fileName && (
                <p className="text-xs text-[#5E636B] truncate max-w-[240px]">
                  {fileName}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-2 text-[#5E636B] hover:text-[#15171A] rounded-full hover:bg-[#F0F0EB] transition-colors"
            aria-label={t.close || 'Close'}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#5E636B] leading-relaxed">
          {t.passwordRequiredDesc || 'Enter the password to read this document. Password is used only to decrypt and never saved.'}
        </p>

        {/* Password Input Field */}
        <div
          className={`flex flex-col gap-1.5 transition-transform ${
            isShaking ? 'animate-[shake_0.4s_ease-in-out]' : ''
          }`}
        >
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder || 'Enter password'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              className="w-full bg-[#F6F6F3] border border-[#E6E6E1] rounded-xl px-3.5 py-3 pr-10 text-sm text-[#15171A] placeholder-[#5E636B] focus:outline-none focus:border-[#5B52D6]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 text-[#5E636B] hover:text-[#15171A] p-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon className="w-4 h-4" />
            </button>
          </div>

          {errorMsg && (
            <span className="text-xs font-semibold text-[#B42318] px-1">
              {errorMsg}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-press flex-1 py-3 bg-[#F0F0EB] text-[#15171A] font-semibold text-xs rounded-xl hover:bg-[#E6E6E1] transition-colors"
          >
            {t.skip || 'Skip'}
          </button>

          <button
            type="submit"
            disabled={!password.trim()}
            className="btn-press flex-1 py-3 bg-[#5B52D6] disabled:opacity-50 text-white font-semibold text-xs rounded-xl hover:bg-[#483EB8] transition-colors shadow-sm"
          >
            {t.unlock || 'Unlock'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
