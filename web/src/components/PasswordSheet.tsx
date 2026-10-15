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
      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <div className="flex items-start justify-between">
          <span aria-hidden="true" className="w-16 h-16 box-border border-[1.5px] border-[#1A1A1A] rounded-full bg-[#E9B44C] flex items-center justify-center">
            <LockIcon className="w-7 h-7" />
          </span>
          <button type="button" onClick={onCancel} className="sv-press w-11 h-11 box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center" aria-label={t.close || 'Close'}>
            <CloseIcon className="w-[18px] h-[18px]" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="sv-display m-0 text-[34px] leading-[1.02] text-[#1A1A1A]">
            {t.passwordRequiredTitle || 'This PDF is locked'}<span className="text-[#D9603B]">.</span>
          </h2>
          <p className="m-0 text-[15.5px] leading-[1.4] text-[#3B3E3C]">
            {fileName ? `${fileName} ` : ''}{t.passwordRequiredDesc || 'needs its password. It is used once and never saved.'}
          </p>
        </div>
        <div className={`flex flex-col gap-2 ${isShaking ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
          <label htmlFor="sv-pdf-password" className="text-[13px] font-bold">{t.password || 'Password'}</label>
          <div className={`flex items-center gap-1.5 h-14 box-border pl-[18px] pr-1.5 rounded-[28px] border-[1.5px] ${errorMsg ? 'border-[#D9603B] shadow-[0_0_0_3px_#F8D9CB]' : 'border-[#1A1A1A]'}`}>
            <input
              id="sv-pdf-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              className="flex-1 min-w-0 border-0 bg-transparent font-semibold text-[17px] tracking-[2px] text-[#1A1A1A] outline-none"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="w-11 h-11 rounded-full flex items-center justify-center" aria-label={showPassword ? 'Hide password' : 'Show password'}>
              <EyeIcon className="w-5 h-5" />
            </button>
          </div>
          {errorMsg && (
            <span role="alert" className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#B3361A]">{errorMsg}</span>
          )}
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={onCancel} className="sv-press flex-1 h-14 rounded-[28px] border-[1.5px] border-[#1A1A1A] bg-transparent font-semibold text-[16px]">
            {t.skipThisFile || 'Skip this file'}
          </button>
          <button type="submit" disabled={!password.trim()} className="sv-press flex-[1.3] h-14 rounded-[28px] border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] disabled:opacity-50 font-bold text-[16px]">
            {t.unlock || 'Unlock'}
          </button>
        </div>
        <p className="m-0 text-[12.5px] text-[#575B58]">{t.passwordOnce || 'The password is used once and never saved.'}</p>
      </form>
    </Sheet>
  )
}
