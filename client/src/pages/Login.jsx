import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { session } from '../services/api.js';
import notify from '../services/notify.js';
import { useSileoNotice } from '../hooks/useSileoNotice.js';

const FEATURE_ART =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCQDt_qykwZIxiz9ZYZ6fR-gF3aANZ8rKGZWeZSdJi9wDavoHDqqDlkKKxaJXv_sb0r_JOTo9HmTHxQBs4JE5HwfMDtjBkTqffRLiN2kJ5_unTJakCIvZvkKm7TRWiT46E9ta8_5h2C49Xzq_AueGyTRWiG9gr0f_Ed_-7uA7xndUAi7YMsJQLeUBLwyqm1yTyIPsHcFn5rRx0-p_gXS8dKRToRRGEaYYmDCjno-ECa0ibzOO11UzuqtQ';

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

const APPLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 170 170" fill="currentColor" aria-hidden="true">
    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.69-7.85-12-14.43-6.19-9.46-11.03-20.53-14.52-33.22-3.48-12.68-5.23-24.71-5.23-36.08 0-14.45 3.37-26.68 10.12-36.7 6.74-10.02 15.54-15.17 26.4-15.45 4.79 0 10.12 1.34 16 4.02 5.88 2.68 9.78 4.08 11.69 4.2 1.54 0 5.49-1.4 11.87-4.2 6.38-2.8 11.95-4.08 16.71-3.85 12.35.63 22.36 5.37 30.03 14.22-10.74 6.5-16.03 15.47-15.86 26.92.17 9.17 3.55 16.92 10.13 23.24 6.58 6.32 14.33 10.01 23.25 11.07-2.38 7.31-5.49 14.63-9.33 21.96zM119.22 33.15c0-6.9 2.45-13.38 7.35-19.45 4.9-6.07 10.97-9.84 18.22-11.31.5 2.12.75 4.25.75 6.39 0 6.9-2.58 13.56-7.74 19.98-5.16 6.42-11.38 10.22-18.66 11.4-.24-2.36-.36-4.7-.36-7.01z"/>
  </svg>
);

const CSS = '';

export default function Login() {
  const navigate = useNavigate();
  const mobileRef = useRef(null);
  const [mode, setMode] = useState('phone');
  const [mobile, setMobile] = useState('');
  const [whatsappOptin, setWhatsappOptin] = useState(true);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [mobileError, setMobileError] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');


  useSileoNotice(error, 'error', { title: 'Could not sign you in' });

  function switchAuthTab(next) {
    setMode(next);
    setError('');
  }

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function resetPhoneFlow() {
    setOtpSent(false);
    setOtp('');
    setOtpMessage('');
    setCooldown(0);
    setError('');
  }

  async function sendOtp() {
    if (submitting) return;
    if (!/^\d{10}$/.test(mobile)) {
      setMobileError(true);
      mobileRef.current?.focus();
      setTimeout(() => setMobileError(false), 1500);
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const response = await api.post('/auth/otp/send', { mobile });
      setOtpSent(true);
      setCooldown(30);
      if (response.data?.devOtp) {
        setOtp(String(response.data.devOtp));
        setOtpMessage(`Development OTP: ${response.data.devOtp}`);
        notify.info({ title: 'Development OTP ready', description: 'Filled in automatically for local testing.' });
      } else {
        setOtp('');
        setOtpMessage(`We sent a 6-digit code to +91 ${mobile} on WhatsApp.`);
        notify.success({ title: 'OTP sent on WhatsApp', description: `Check +91 ${mobile} for the 6-digit code.` });
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not send the OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp() {
    if (submitting) return;
    if (!/^\d{4,8}$/.test(otp.trim())) {
      setError('Enter the OTP you received on WhatsApp.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const response = await api.post('/auth/otp/verify', { mobile, otp: otp.trim() });
      const data = response.data;
      localStorage.setItem('token', data.accessToken || data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      if (data.user) {
        localStorage.setItem('user', JSON.stringify({ ...data.user, mobile: data.mobile || data.user.mobile }));
      }
      // The gateway session token is no longer needed in browser storage: a
      // signed-in checkout is marked verified in gateway metadata. Remove any
      // value left by an older build.
      localStorage.removeItem('youpiCustomerToken');
      notify.success({ title: 'Signed in', description: 'Welcome back to Konkani Samudai.' });
      navigate('/movies');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Invalid OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
      // Keep the refresh token too, so the session survives reloads and expiry.
      localStorage.setItem('token', r.data.accessToken || r.data.token);
      if (r.data.refreshToken) localStorage.setItem('refreshToken', r.data.refreshToken);
      if (r.data.user) localStorage.setItem('user', JSON.stringify(r.data.user));
      // A password login starts a new identity; never reuse the previous
      // gateway customer session.
      localStorage.removeItem('youpiCustomerToken');
      notify.success({
        title: isRegister ? 'Account created' : 'Signed in',
        description: isRegister ? 'Welcome to Konkani Samudai.' : 'Welcome back.',
      });
      navigate('/movies');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const phoneTabActive = mode === 'phone';

  const signedIn = Boolean(localStorage.getItem('token'));
  let account = null;
  try {
    account = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    account = null;
  }
  function signOut() {
    session.logout();
    navigate('/');
  }
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-7 bg-[#252A30] border border-[#B5AFA6]/20 rounded-[24px] p-6 sm:p-8 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">Household Account</p>
          <h1 className="font-editorial text-3xl font-semibold text-[#F2F0EB] mt-1">
            {signedIn
              ? `Welcome, ${account?.displayName || account?.name || 'member'}`
              : 'Sign in to Konkani Samudai'}
          </h1>
        </div>

        {signedIn ? (
          <div className="space-y-4 text-sm text-[#B5AFA6]">
            <div className="p-4 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/20 space-y-1.5">
              <p><strong className="text-[#F2F0EB]">Email:</strong> {account?.email || '—'}</p>
              <p><strong className="text-[#F2F0EB]">Mobile:</strong> {account?.mobile || account?.phone || '—'}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/my-tickets" className="px-4 py-2 rounded-xl bg-[#C8FF1F] text-[#1E2227] text-xs font-semibold">
                My tickets
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="px-4 py-2 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/25 text-xs font-semibold text-[#F2F0EB] hover:border-[#C8FF1F]"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center rounded-xl bg-[#1E2227] border border-[#B5AFA6]/20 p-1">
              <button
                type="button"
                onClick={() => switchAuthTab('phone')}
                className={`px-4 py-2 rounded-lg text-xs transition-colors ${
                  phoneTabActive ? 'bg-[#C8FF1F] text-[#1E2227] font-semibold' : 'text-[#B5AFA6] hover:text-[#F2F0EB]'
                }`}
              >
                Mobile OTP
              </button>
              <button
                type="button"
                onClick={() => switchAuthTab('email')}
                className={`px-4 py-2 rounded-lg text-xs transition-colors ${
                  !phoneTabActive ? 'bg-[#C8FF1F] text-[#1E2227] font-semibold' : 'text-[#B5AFA6] hover:text-[#F2F0EB]'
                }`}
              >
                Email &amp; password
              </button>
            </div>

            {error && (
              <div role="alert" className="px-4 py-3 rounded-xl bg-[#1E2227] border border-[#F08A80]/40 text-xs text-[#F0B0A6]">
                {error}
              </div>
            )}

            {phoneTabActive ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="mobile-input" className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#B5AFA6]">
                    Registered mobile number
                  </label>
                  <div className="flex rounded-xl bg-[#1E2227] border border-[#B5AFA6]/25 overflow-hidden">
                    <span className="flex items-center px-3 text-sm font-mono text-[#B5AFA6] border-r border-[#B5AFA6]/20">
                      +91
                    </span>
                    <input
                      id="mobile-input"
                      maxLength={10}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="98765 43210"
                      ref={mobileRef}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={mobile}
                      aria-invalid={mobileError}
                      disabled={otpSent}
                      className="w-full bg-transparent px-3 py-3 font-mono text-sm text-[#F2F0EB] outline-none placeholder:text-[#B5AFA6]/50"
                    />
                  </div>
                  {mobileError && <p className="mt-1.5 text-xs text-[#F08A80]">Enter a valid 10-digit mobile number.</p>}
                </div>

                {otpSent && (
                  <div>
                    <label htmlFor="otp-input" className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#B5AFA6]">
                      Enter the 6-digit OTP
                    </label>
                    <input
                      id="otp-input"
                      maxLength={6}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      className="w-full px-4 py-3 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/25 font-mono text-sm text-[#F2F0EB] outline-none"
                    />
                    <div className="flex justify-between gap-3 mt-2">
                      <button type="button" onClick={resetPhoneFlow} className="text-xs font-semibold text-[#C8FF1F]">Change number</button>
                      <button type="button" onClick={sendOtp} disabled={cooldown > 0 || submitting} className="text-xs font-semibold text-[#C8FF1F] disabled:opacity-50">
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                      </button>
                    </div>
                    {otpMessage && <p className="mt-2 text-[11px] text-[#B5AFA6] leading-relaxed">{otpMessage}</p>}
                  </div>
                )}

                <label className="flex items-start gap-3 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/20 p-3 text-xs text-[#B5AFA6] normal-case">
                  <input type="checkbox" checked={whatsappOptin} onChange={(e) => setWhatsappOptin(e.target.checked)} className="mt-0.5 accent-[#C8FF1F]" />
                  <span>
                    <strong className="block text-[#F2F0EB] text-xs font-semibold">Send booking confirmations over WhatsApp</strong>
                    Receive passes and booking links on WhatsApp. You can change this anytime.
                  </span>
                </label>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={otpSent ? verifyOtp : sendOtp}
                  className="w-full py-3 rounded-xl bg-[#C8FF1F] text-[#1E2227] text-xs font-semibold transition-colors hover:bg-[#B5AFA6] disabled:opacity-50"
                >
                  {submitting ? 'Please wait…' : otpSent ? 'Verify and sign in →' : 'Send login OTP →'}
                </button>
                <p className="text-[11px] text-[#B5AFA6] leading-relaxed">
                  Your verified number is used for payment too, so checkout will not ask for it again.
                </p>
              </div>
            ) : (
              <form onSubmit={submitCredentials} className="space-y-3">
                {isRegister && (
                  <input
                    name="displayName"
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Full name"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    className="w-full px-4 py-3 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/25 text-sm text-[#F2F0EB] outline-none"
                  />
                )}
                <input
                  name="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  value={email}
                  className="w-full px-4 py-3 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/25 text-sm text-[#F2F0EB] outline-none"
                />
                <div className="relative">
                  <input
                    name="password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    required
                    value={password}
                    className="w-full px-4 py-3 pr-14 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/25 text-sm text-[#F2F0EB] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-[#C8FF1F]"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button
                  disabled={submitting}
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#C8FF1F] text-[#1E2227] text-xs font-semibold transition-colors hover:bg-[#B5AFA6] disabled:opacity-50"
                >
                  {submitting ? 'Please wait…' : isRegister ? 'Create account →' : 'Sign in securely →'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister((value) => !value);
                    setError('');
                  }}
                  className="w-full text-center text-xs font-semibold text-[#C8FF1F]"
                >
                  {isRegister ? 'Already a member? Sign in' : 'New to Konkani Samudai? Create an account'}
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-[#B5AFA6]/15">
              <Link to="/movies" className="text-xs font-semibold text-[#F2F0EB] underline underline-offset-4 hover:text-[#C8FF1F]">
                Continue browsing as a guest →
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-wider text-[#B5AFA6]">
              <span>✓ Digital QR passes</span>
              <span>◷ 8-minute seat hold</span>
              <span>✦ Member rates</span>
            </div>
          </>
        )}
      </div>

      <div className="lg:col-span-5 bg-[#B5AFA6] text-[#1E2227] rounded-[24px] p-6 sm:p-8 space-y-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-mono text-xs font-semibold text-[#2C3138]">KS · 1934 · MARGAO</p>
            <h2 className="font-editorial text-2xl font-semibold mt-1">The Samudai card</h2>
          </div>
          <span className="font-mono text-2xl font-bold tabular-nums">₹1</span>
        </div>
        <p className="text-xs text-[#2C3138]">
          Member rates on every film and festival · priority seats · AGM voting rights · Sunday Konkani classes.
        </p>
        <Link
          to="/#join"
          className="block w-full text-center py-3 rounded-xl bg-[#1E2227] text-[#C8FF1F] text-xs font-semibold hover:bg-[#C8FF1F] hover:text-[#1E2227] transition-colors"
        >
          Activate ₹1 Samudai Card
        </Link>
      </div>
    </div>
  );
}
