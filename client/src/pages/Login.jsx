import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api.js';

const FEATURE_ART = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCQDt_qykwZIxiz9ZYZ6fR-gF3aANZ8rKGZWeZSdJi9wDavoHDqqDlkKKxaJXv_sb0r_JOTo9HmTHxQBs4JE5HwfMDtjBkTqffRLiN2kJ5_unTJakCIvZvkKm7TRWiT46E9ta8_5h2C49Xzq_AueGyTRWiG9gr0f_Ed_-7uA7xndUAi7YMsJQLeUBLwyqm1yTyIPsHcFn5rRx0-p_gXS8dKRToRRGEaYYmDCjno-ECa0ibzOO11UzuqtQ';

const GOOGLE_ICON = (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
);

const APPLE_ICON = (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 170 170">
    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.69-7.85-12-14.43-6.19-9.46-11.03-20.53-14.52-33.22-3.48-12.68-5.23-24.71-5.23-36.08 0-14.45 3.37-26.68 10.12-36.7 6.74-10.02 15.54-15.17 26.4-15.45 4.79 0 10.12 1.34 16 4.02 5.88 2.68 9.78 4.08 11.69 4.2 1.54 0 5.49-1.4 11.87-4.2 6.38-2.8 11.95-4.08 16.71-3.85 12.35.63 22.36 5.37 30.03 14.22-10.74 6.5-16.03 15.47-15.86 26.92.17 9.17 3.55 16.92 10.13 23.24 6.58 6.32 14.33 10.01 23.25 11.07-2.38 7.31-5.49 14.63-9.33 21.96zM119.22 33.15c0-6.9 2.45-13.38 7.35-19.45 4.9-6.07 10.97-9.84 18.22-11.31.5 2.12.75 4.25.75 6.39 0 6.9-2.58 13.56-7.74 19.98-5.16 6.42-11.38 10.22-18.66 11.4-.24-2.36-.36-4.7-.36-7.01z" />
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const mobileRef = useRef(null);

  const [mode, setMode] = useState('phone');
  const [mobile, setMobile] = useState('');
  const [whatsappOptin, setWhatsappOptin] = useState(true);
  const [otpState, setOtpState] = useState('idle'); // idle | sending | sent
  const [mobileError, setMobileError] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function switchAuthTab(next) {
    setMode(next);
    setError('');
  }

  function triggerOtpDemo() {
    if (!mobile || mobile.trim().length < 10) {
      setMobileError(true);
      mobileRef.current?.focus();
      setTimeout(() => setMobileError(false), 1500);
      return;
    }
    setOtpState('sending');
    setTimeout(() => {
      setOtpState('sent');
      setTimeout(() => setOtpState('idle'), 3000);
    }, 1200);
  }

  async function submitCredentials(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) {
        await api.post('/auth/register', { email, password, displayName: displayName || undefined });
      }
      const r = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', r.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const phoneTabActive = mode === 'phone';

  return (
    <main className="auth-page min-h-screen w-full flex items-center justify-center p-margin-mobile md:p-margin-tablet lg:p-margin bg-background">
      <div className="flex flex-col w-full items-center justify-center py-space-sm md:py-space-md">
        {/* Subtle Backing Glow Spotlight (pure CSS containment) */}
        <div className="relative w-full max-w-6xl mx-auto">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[340px] bg-primary-container/10 blur-[130px] rounded-full pointer-events-none" />

          {/* Main Duo Grid Presentation */}
          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
            {/* LEFT FEATURE SPOTLIGHT CARD (5 Cols on Large screens) */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-xl overflow-hidden shadow-xl bg-surface-container-low p-space-lg relative group">
              {/* Volumetric Ambient Light Cone at top of card */}
              <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary-container/15 via-primary-container/5 to-transparent pointer-events-none" />

              {/* Card Top: Tag & Specs Header */}
              <div className="relative z-10 flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/60 text-primary font-label-sm text-label-sm uppercase tracking-wider backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Premieres This Week
                  </span>
                  <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-tertiary">theater_comedy</span>
                    Screen 01 &bull; Kodial
                  </span>
                </div>

                {/* Featured Release Stage Artwork Banner */}
                <div className="relative rounded-lg overflow-hidden shadow-lg h-60 w-full group">
                  <div
                    className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url('${FEATURE_ART}')` }}
                    role="img"
                    aria-label="Cinematic atmospheric photograph inside an ultra-luxury modern Konkani amphitheater cinema"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/40 to-transparent" />

                  {/* Floating Format Badges */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded bg-surface-container-highest/90 text-primary-fixed-dim font-label-sm text-label-sm backdrop-blur-sm">4K DUAL LASER</span>
                      <span className="px-2.5 py-1 rounded bg-surface-container-highest/90 text-tertiary font-label-sm text-label-sm backdrop-blur-sm">DOLBY ATMOS 128 CH</span>
                    </div>
                    <span className="flex items-center gap-1 text-primary text-label-sm font-label-sm bg-surface-dim/80 px-2 py-1 rounded backdrop-blur-md">
                      <span className="material-symbols-outlined text-sm">confirmation_number</span>
                      Fast Filling
                    </span>
                  </div>
                </div>

                {/* Featured Title & Metadata */}
                <div className="flex flex-col gap-space-xs pt-space-xs">
                  <h2 className="font-headline-md text-headline-md text-on-surface leading-tight tracking-tight">
                    Kodial Fest Premiere Night &amp; 4K Laser Showcase
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Celebrate Konkani cinematic heritage through curated digital restorations and exclusive member premieres with acoustic maestro introductions.
                  </p>
                </div>
              </div>

              {/* Card Bottom: Club Samudai Privileges Highlight Box */}
              <div className="relative z-10 mt-space-lg rounded-xl bg-surface-container p-space-md shadow-md flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">hotel_class</span>
                    <span className="font-label-md text-label-md text-on-surface uppercase tracking-wider">Club Samudai Privileges</span>
                  </div>
                  <span className="text-xs font-label-sm text-label-sm text-primary px-2 py-0.5 rounded-full bg-surface-container-highest">TIER 1 ACCESS</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-space-xs">
                  <div className="flex flex-col items-center text-center p-2 rounded bg-surface-container-low">
                    <span className="material-symbols-outlined text-primary text-lg mb-1">qr_code_scanner</span>
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">Instant Pass</span>
                    <span className="font-body-sm text-[10px] text-on-surface-variant">Direct seat entry</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-2 rounded bg-surface-container-low">
                    <span className="material-symbols-outlined text-tertiary text-lg mb-1">wine_bar</span>
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">Lounge Access</span>
                    <span className="font-body-sm text-[10px] text-on-surface-variant">Pre-show lounge</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-2 rounded bg-surface-container-low">
                    <span className="material-symbols-outlined text-secondary text-lg mb-1">airline_seat_recline_extra</span>
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">VIP Rows A-D</span>
                    <span className="font-body-sm text-[10px] text-on-surface-variant">Reserved sightline</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT SIGN-IN AUTHENTICATION CARD (7 Cols on Large screens) */}
            <div className="lg:col-span-7 rounded-xl shadow-xl bg-surface-container-high p-space-lg md:p-space-xl flex flex-col justify-between relative">
              {/* Header Branding & Subtitle */}
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shadow-sm">
                      <span className="material-symbols-outlined text-2xl">movie_filter</span>
                    </div>
                    <div>
                      <span className="font-headline-sm text-headline-sm text-on-surface block tracking-tight">KONKANI SAMUDAI</span>
                      <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest block">Theatrical Community Portal</span>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Encrypted 256-bit
                  </div>
                </div>

                <div className="flex flex-col gap-1 mt-space-xs">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                    Welcome back to Konkani Samudai
                  </h1>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Sign in to access your digital movie passes, seat reservations, and Club Samudai privileges.
                  </p>
                </div>

                {/* Auth Mode Toggle Tabs (Periwinkle indicator) */}
                <div className="grid grid-cols-2 rounded-lg bg-surface-container-low p-1 gap-1">
                  <button
                    className={`w-full py-2.5 rounded text-center font-label-md text-label-md transition-all duration-200 flex items-center justify-center gap-2 ${phoneTabActive ? 'bg-primary-container text-on-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}
                    id="tab-phone"
                    onClick={() => switchAuthTab('phone')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">smartphone</span>
                    Phone Number
                  </button>
                  <button
                    className={`w-full py-2.5 rounded text-center font-label-md text-label-md transition-all duration-200 flex items-center justify-center gap-2 ${phoneTabActive ? 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container' : 'bg-primary-container text-on-primary font-semibold shadow-sm'}`}
                    id="tab-email"
                    onClick={() => switchAuthTab('email')}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">mail</span>
                    Email &amp; Password
                  </button>
                </div>

                {/* Form Panel: Phone Login (Default active) */}
                <div className={`${phoneTabActive ? 'flex' : 'hidden'} flex-col gap-space-md`} id="panel-phone">
                  <div className="flex flex-col gap-space-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant flex items-center justify-between" htmlFor="mobile-input">
                      <span>REGISTERED MOBILE NUMBER</span>
                      <span className="text-tertiary font-label-sm text-label-sm font-normal">Fast OTP Delivery</span>
                    </label>
                    {/* Phone Input Container */}
                    <div className="flex items-center rounded-lg bg-surface-container-lowest overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-primary-container transition-all">
                      {/* Country Prefix Selector */}
                      <div className="flex items-center gap-1.5 px-3.5 py-3 bg-surface-container text-on-surface font-label-md text-label-md select-none">
                        <span className="text-base">&#127470;&#127479;</span>
                        <span>+91</span>
                        <span className="material-symbols-outlined text-sm text-on-surface-variant">expand_more</span>
                      </div>
                      {/* Input Box */}
                      <input
                        className={`w-full bg-transparent px-4 py-3 text-on-surface placeholder:text-outline font-headline-sm text-headline-sm tracking-wide focus:outline-none ${mobileError ? 'ring-2 ring-error' : ''}`}
                        id="mobile-input"
                        maxLength={10}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="98765 43210"
                        ref={mobileRef}
                        type="tel"
                        value={mobile}
                      />
                      <button className="pr-3 text-on-surface-variant hover:text-primary transition-colors" onClick={() => mobileRef.current?.focus()} title="Open numeric keypad" type="button">
                        <span className="material-symbols-outlined text-lg">dialpad</span>
                      </button>
                    </div>
                  </div>

                  {/* WhatsApp Opt-in Checkbox checked by default */}
                  <label className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low cursor-pointer select-none group">
                    <div className="relative flex items-center mt-0.5">
                      <input checked={whatsappOptin} className="peer sr-only" id="whatsapp-optin" onChange={(e) => setWhatsappOptin(e.target.checked)} type="checkbox" />
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${whatsappOptin ? 'bg-primary-container border-primary-container' : 'bg-surface-container border-outline-variant'}`}>
                        <span className={`material-symbols-outlined text-sm text-on-primary font-bold transition-transform ${whatsappOptin ? 'scale-100' : 'scale-0'}`}>check</span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-md text-label-md text-on-surface">Send movie passes &amp; booking confirmations over WhatsApp</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Direct interactive seat ticket links &amp; gate QR codes sent immediately.</span>
                    </div>
                  </label>

                  {/* Primary Action Button with periwinkle luminescence */}
                  <button
                    className="w-full py-3.5 px-6 rounded-lg bg-gradient-to-r from-primary-container to-inverse-primary text-surface-container-lowest font-headline-sm text-headline-sm font-semibold tracking-wide shadow-lg hover:shadow-primary-container/30 hover:scale-[1.008] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                    disabled={otpState !== 'idle'}
                    id="cta-btn"
                    onClick={triggerOtpDemo}
                    type="button"
                  >
                    {otpState === 'sending' && (
                      <>
                        <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                        <span>Dispatching OTP...</span>
                      </>
                    )}
                    {otpState === 'sent' && (
                      <>
                        <span className="material-symbols-outlined text-xl">check_circle</span>
                        <span>6-Digit Code Transmitted</span>
                      </>
                    )}
                    {otpState === 'idle' && (
                      <>
                        <span>Send Login OTP</span>
                        <span className="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Form Panel: Email & Password (Hidden Initially) */}
                <div className={`${phoneTabActive ? 'hidden' : 'flex'} flex-col gap-space-md`} id="panel-email">
                  {error && (
                    <div className="flex items-start gap-2 rounded-lg bg-error-container/30 border border-error/40 px-3 py-2 text-error font-body-sm text-body-sm">
                      <span className="material-symbols-outlined text-base">error</span>
                      <span>{error}</span>
                    </div>
                  )}

                  {isRegister && (
                    <div className="flex flex-col gap-space-xs">
                      <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="display-name-input">FULL NAME</label>
                      <div className="flex items-center rounded-lg bg-surface-container-lowest overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-primary-container transition-all">
                        <span className="pl-3.5 material-symbols-outlined text-outline text-lg">person</span>
                        <input
                          className="w-full bg-transparent px-3 py-3 text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none"
                          id="display-name-input"
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Patron Name"
                          type="text"
                          value={displayName}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-space-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="email-input">REGISTERED EMAIL</label>
                    <div className="flex items-center rounded-lg bg-surface-container-lowest overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-primary-container transition-all">
                      <span className="pl-3.5 material-symbols-outlined text-outline text-lg">alternate_email</span>
                      <input
                        className="w-full bg-transparent px-3 py-3 text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none"
                        id="email-input"
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="samudai.patron@cinemamail.in"
                        type="email"
                        value={email}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-space-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="password-input">PASSWORD</label>
                      <a className="auth-underline font-label-sm text-label-sm text-primary hover:underline" href="#">Forgot?</a>
                    </div>
                    <div className="flex items-center rounded-lg bg-surface-container-lowest overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-primary-container transition-all">
                      <span className="pl-3.5 material-symbols-outlined text-outline text-lg">lock</span>
                      <input
                        className="w-full bg-transparent px-3 py-3 text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none"
                        id="password-input"
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                      />
                      <button className="pr-3 text-on-surface-variant hover:text-primary transition-colors" onClick={() => setShowPassword((v) => !v)} type="button">
                        <span className="material-symbols-outlined text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>

                  <button
                    className="w-full py-3.5 px-6 rounded-lg bg-gradient-to-r from-primary-container to-inverse-primary text-surface-container-lowest font-headline-sm text-headline-sm font-semibold tracking-wide shadow-lg hover:shadow-primary-container/30 hover:scale-[1.008] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                    disabled={submitting}
                    onClick={submitCredentials}
                    type="button"
                  >
                    {submitting ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                        <span>{isRegister ? 'Creating Account...' : 'Signing In...'}</span>
                      </>
                    ) : (
                      <>
                        <span>{isRegister ? 'Create Account' : 'Sign In with Credentials'}</span>
                        <span className="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">arrow_forward</span>
                      </>
                    )}
                  </button>

                  {/* Register / Sign-in toggle */}
                  <div className="flex items-center justify-center">
                    <button
                      className="font-label-sm text-label-sm text-primary hover:underline transition-colors"
                      onClick={() => { setIsRegister((v) => !v); setError(''); }}
                      type="button"
                    >
                      {isRegister ? 'Already a member? Sign in with credentials' : 'New to Konkani Samudai? Create an account'}
                    </button>
                  </div>
                </div>

                {/* Social Divider */}
                <div className="flex items-center gap-3 my-space-xs">
                  <div className="flex-1 h-[1px] bg-outline-variant/30" />
                  <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant/80">OR CONNECT VIA</span>
                  <div className="flex-1 h-[1px] bg-outline-variant/30" />
                </div>

                {/* Social Sign-in Buttons */}
                <div className="grid grid-cols-2 gap-space-sm">
                  <button className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg bg-surface-container hover:bg-surface-bright text-on-surface font-label-md text-label-md transition-all shadow-sm" type="button">
                    {GOOGLE_ICON}
                    <span>Google Pass</span>
                  </button>
                  <button className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg bg-surface-container hover:bg-surface-bright text-on-surface font-label-md text-label-md transition-all shadow-sm" type="button">
                    {APPLE_ICON}
                    <span>Apple ID</span>
                  </button>
                </div>

                {/* Guest Checkout / Instant Access Link */}
                <div className="flex items-center justify-center pt-space-xs">
                  <Link className="font-headline-sm text-headline-sm text-primary hover:text-primary-fixed flex items-center gap-1 group transition-colors" to="/">
                    <span>Continue as Guest to Seat Booking</span>
                    <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-1">chevron_right</span>
                  </Link>
                </div>
              </div>

              {/* Trust Badges Footer Bar */}
              <div className="mt-space-lg pt-space-md bg-surface-container-low/70 -mx-space-lg -mb-space-lg md:-mx-space-xl md:-mb-space-xl px-space-md py-space-sm rounded-b-xl flex flex-wrap items-center justify-around gap-2 text-on-surface-variant font-label-sm text-label-sm">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">verified_user</span>
                  <span>Instant QR Entry</span>
                </div>
                <span className="text-outline-variant">&bull;</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-tertiary">timer</span>
                  <span>8-Min Seat Hold</span>
                </div>
                <span className="text-outline-variant">&bull;</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-secondary">cancel_schedule_send</span>
                  <span>Zero Cancel Fees</span>
                </div>
              </div>
            </div>
          </div>

          {/* Micro Metadata Bar below Duo Layout */}
          <div className="flex flex-col sm:flex-row items-center justify-between text-on-surface-variant/70 font-body-sm text-body-sm px-space-sm pt-space-md gap-space-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary/70" />
              <span>Konkani Samudai Theaters &bull; Kodial Central Auditorium, Mangaluru</span>
            </div>
            <div className="flex items-center gap-space-md font-label-sm text-label-sm">
              <a className="hover:text-primary transition-colors" href="#">Seat Allocation Policy</a>
              <span>/</span>
              <a className="hover:text-primary transition-colors" href="#">Patron Privileges</a>
              <span>/</span>
              <a className="hover:text-primary transition-colors" href="#">Box Office Support</a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
