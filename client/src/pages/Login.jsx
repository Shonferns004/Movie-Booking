import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api.js';

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

const CSS = `
.kk-auth{--ink:#0A2A31;--tide:#123E47;--shell:#EFEBE0;--kokum:#C2305E;--mango:#F4B63F;--deep:#071E23;min-height:100vh;background:var(--ink);color:var(--shell);padding:28px;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;isolation:isolate;overflow:hidden}
.kk-auth *{box-sizing:border-box}.kk-auth:before{content:"";position:absolute;width:600px;height:600px;right:-180px;top:-280px;border-radius:50%;background:rgba(194,48,94,.13);filter:blur(30px);z-index:-1}.kk-auth:after{content:"";position:absolute;width:500px;height:500px;left:-260px;bottom:-300px;border-radius:50%;background:rgba(244,182,63,.08);filter:blur(25px);z-index:-1}
.kk-auth-wrap{width:100%;max-width:1120px}.kk-auth-grid{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);border:1px solid rgba(239,235,224,.12);border-radius:26px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.28);background:var(--deep);animation:kk-rise .55s ease both}
.kk-auth-feature{position:relative;min-height:650px;padding:30px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(180deg,rgba(7,30,35,.05) 0%,rgba(7,30,35,.3) 35%,#071E23 82%),url('${FEATURE_ART}') center/cover}
.kk-auth-feature:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(18,62,71,.45),transparent 50%);pointer-events:none}.kk-auth-feature>*{position:relative}
.kk-auth-kicker{display:inline-flex;align-items:center;gap:9px;width:max-content;max-width:100%;border:1px solid rgba(239,235,224,.25);border-radius:999px;padding:8px 12px;background:rgba(7,30,35,.48);backdrop-filter:blur(10px);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.kk-auth-dot{width:7px;height:7px;background:var(--mango);border-radius:50%;box-shadow:0 0 0 4px rgba(244,182,63,.14)}
.kk-auth-feature-copy{margin-top:auto;padding-top:200px}.kk-auth-eyebrow{color:var(--mango);font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin:0 0 13px}.kk-auth-feature h2{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:clamp(34px,4vw,53px);line-height:1.02;letter-spacing:-.045em;margin:0;max-width:470px}.kk-auth-feature-copy p{color:rgba(239,235,224,.76);font-size:14px;line-height:1.7;max-width:390px;margin:17px 0 0}
.kk-auth-perks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:28px}.kk-auth-perk{border:1px solid rgba(239,235,224,.15);background:rgba(7,30,35,.55);backdrop-filter:blur(12px);border-radius:13px;padding:13px 10px}.kk-auth-perk-icon{color:var(--mango);font-size:19px;display:block;margin-bottom:8px}.kk-auth-perk strong{display:block;font-size:11px;line-height:1.3}.kk-auth-perk span:last-child{display:block;color:rgba(239,235,224,.6);font-size:10px;line-height:1.4;margin-top:5px}
.kk-auth-formside{padding:clamp(25px,4vw,48px);background:var(--shell);color:var(--ink);display:flex;flex-direction:column;justify-content:center}.kk-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:42px}.kk-auth-brandmark{width:43px;height:43px;border-radius:14px;background:var(--ink);color:var(--mango);display:grid;place-items:center;font-family:Georgia,serif;font-size:23px;box-shadow:0 7px 18px rgba(10,42,49,.14)}.kk-auth-brandname{font-family:Georgia,"Times New Roman",serif;font-size:17px;letter-spacing:.035em;font-weight:700}.kk-auth-brandtag{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#6c7775;margin-top:4px}
.kk-auth-heading{font-family:Georgia,"Times New Roman",serif;font-size:clamp(30px,3.2vw,42px);font-weight:500;line-height:1.07;letter-spacing:-.04em;margin:0}.kk-auth-subtitle{font-size:13px;line-height:1.7;color:#65716f;margin:12px 0 25px;max-width:430px}
.kk-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px;background:#e1dfd4;border-radius:12px;margin-bottom:23px}.kk-auth-tab{border:0;border-radius:9px;background:transparent;color:#667371;padding:12px 8px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:background .2s,color .2s}.kk-auth-tab.active{background:var(--ink);color:var(--shell);box-shadow:0 4px 12px rgba(10,42,49,.15)}
.kk-auth-fields{display:flex;flex-direction:column;gap:15px}.kk-auth-label{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}.kk-auth-label small{font-size:10px;letter-spacing:0;text-transform:none;font-weight:500;color:#9a6d22}.kk-auth-inputwrap{display:flex;align-items:center;min-width:0;border:1px solid #d5d4ca;background:#fffdf7;border-radius:11px;overflow:hidden;transition:border-color .2s,box-shadow .2s}.kk-auth-inputwrap:focus-within{border-color:var(--kokum);box-shadow:0 0 0 3px rgba(194,48,94,.1)}.kk-auth-prefix{display:flex;align-items:center;gap:7px;align-self:stretch;padding:0 13px;background:#f0eee5;border-right:1px solid #deddd3;font-size:13px;font-weight:700}.kk-auth-field{width:100%;min-width:0;border:0;outline:0;background:transparent;padding:14px 13px;color:var(--ink);font:500 14px inherit}.kk-auth-field::placeholder{color:#a3aaa4}.kk-auth-iconbtn{border:0;background:transparent;color:#75817c;padding:10px 13px;cursor:pointer;font-size:16px}.kk-auth-check{display:flex;align-items:flex-start;gap:11px;padding:13px;border-radius:11px;background:#e8e6dc;cursor:pointer}.kk-auth-check input{accent-color:var(--kokum);width:16px;height:16px;flex:none;margin-top:2px}.kk-auth-check strong{font-size:11px;line-height:1.5;display:block}.kk-auth-check small{display:block;color:#74807b;font-size:10px;line-height:1.5;margin-top:4px}
.kk-auth-error{border:1px solid #e6b9c5;background:#f8e7ec;color:#8e2142;border-radius:10px;padding:11px 12px;font-size:12px;line-height:1.5}.kk-auth-primary{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:0;border-radius:11px;padding:15px 18px;background:var(--kokum);color:white;font-size:13px;font-weight:800;letter-spacing:.025em;cursor:pointer;box-shadow:0 8px 18px rgba(194,48,94,.18);transition:transform .2s,background .2s,box-shadow .2s}.kk-auth-primary:hover:not(:disabled){background:#a9254f;transform:translateY(-1px);box-shadow:0 11px 23px rgba(194,48,94,.25)}.kk-auth-primary:disabled{opacity:.65;cursor:wait}.kk-auth-forgot{border:0;background:none;color:var(--kokum);font-size:11px;font-weight:700;cursor:pointer;padding:0}.kk-auth-link{border:0;background:none;color:var(--kokum);font-size:12px;font-weight:700;cursor:pointer}.kk-auth-switch{text-align:center;margin-top:17px}.kk-auth-divider{display:flex;align-items:center;gap:12px;color:#909994;font-size:9px;font-weight:800;letter-spacing:.18em;margin:24px 0 14px}.kk-auth-divider:before,.kk-auth-divider:after{content:"";height:1px;flex:1;background:#d7d6cc}.kk-auth-socials{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kk-auth-social{display:flex;align-items:center;justify-content:center;gap:9px;padding:12px 10px;border:1px solid #d9d8ce;border-radius:10px;background:transparent;color:var(--ink);font-size:12px;font-weight:700}.kk-auth-social:disabled{opacity:.65}.kk-auth-guest{text-align:center;margin-top:23px}.kk-auth-guest a{color:var(--ink);font-size:12px;font-weight:800;text-decoration:none;border-bottom:1px solid var(--mango);padding-bottom:3px}.kk-auth-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 17px;color:#76817b;font-size:10px;margin-top:28px}.kk-auth-trust span{display:flex;align-items:center;gap:6px}.kk-auth-trust b{color:var(--kokum);font-size:13px}
.kk-auth-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:15px 5px 0;color:rgba(239,235,224,.53);font-size:10px}.kk-auth-foot-links{display:flex;gap:14px;flex-wrap:wrap}.kk-auth-foot a{color:inherit;text-decoration:none}.kk-auth-foot a:hover{color:var(--mango)}
@keyframes kk-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@media(max-width:850px){.kk-auth{padding:18px}.kk-auth-grid{grid-template-columns:1fr;max-width:600px;margin:auto}.kk-auth-feature{min-height:360px;padding:23px;background-position:center 42%}.kk-auth-feature-copy{padding-top:95px}.kk-auth-feature h2{font-size:38px}.kk-auth-feature-copy p{margin-top:10px}.kk-auth-perks{margin-top:18px}.kk-auth-formside{padding:28px}.kk-auth-brand{margin-bottom:27px}.kk-auth-foot{max-width:600px;margin:auto}}@media(max-width:480px){.kk-auth{padding:10px}.kk-auth-grid{border-radius:19px}.kk-auth-feature{min-height:320px;padding:18px}.kk-auth-feature-copy{padding-top:70px}.kk-auth-feature h2{font-size:32px}.kk-auth-feature-copy p{font-size:12px}.kk-auth-perks{gap:6px}.kk-auth-perk{padding:10px 8px}.kk-auth-perk strong{font-size:10px}.kk-auth-perk span:last-child{font-size:9px}.kk-auth-formside{padding:22px 17px}.kk-auth-brand{margin-bottom:24px}.kk-auth-heading{font-size:31px}.kk-auth-tabs{margin-bottom:18px}.kk-auth-tab{font-size:11px;padding:11px 5px}.kk-auth-socials{gap:7px}.kk-auth-social{font-size:11px}.kk-auth-trust{gap:8px 12px}.kk-auth-foot{font-size:9px}}@media(prefers-reduced-motion:reduce){.kk-auth-grid{animation:none}.kk-auth *{transition:none!important;scroll-behavior:auto!important}}
`;

export default function Login() {
  const navigate = useNavigate();
  const mobileRef = useRef(null);
  const [mode, setMode] = useState('phone');
  const [mobile, setMobile] = useState('');
  const [whatsappOptin, setWhatsappOptin] = useState(true);
  const [otpState, setOtpState] = useState('idle');
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
    <main className="kk-auth">
      <style>{CSS}</style>
      <div className="kk-auth-wrap">
        <div className="kk-auth-grid">
          <section className="kk-auth-feature" aria-label="Konkani Samudai cinema">
            <div className="kk-auth-kicker"><span className="kk-auth-dot" /> A community that loves cinema</div>
            <div className="kk-auth-feature-copy">
              <p className="kk-auth-eyebrow">Your next story starts here</p>
              <h2>Big stories.<br />Shared together.</h2>
              <p>Celebrate Konkani cinema, discover special screenings, and keep every movie night close.</p>
              <div className="kk-auth-perks">
                <div className="kk-auth-perk"><span className="kk-auth-perk-icon">▦</span><strong>Digital passes</strong><span>Tickets ready when you are</span></div>
                <div className="kk-auth-perk"><span className="kk-auth-perk-icon">✦</span><strong>Member moments</strong><span>Special community screenings</span></div>
                <div className="kk-auth-perk"><span className="kk-auth-perk-icon">◷</span><strong>Easy booking</strong><span>Pick seats in a few steps</span></div>
              </div>
            </div>
          </section>

          <section className="kk-auth-formside">
            <div className="kk-auth-brand">
              <div className="kk-auth-brandmark" aria-hidden="true">K</div>
              <div><div className="kk-auth-brandname">KONKANI SAMUDAI</div><div className="kk-auth-brandtag">Theatrical community portal</div></div>
            </div>

            <h1 className="kk-auth-heading">{phoneTabActive ? 'Welcome to movie night.' : (isRegister ? 'Join the community.' : 'Good to see you again.')}</h1>
            <p className="kk-auth-subtitle">{phoneTabActive ? 'Sign in with your mobile number to keep your bookings, seats, and digital passes together.' : (isRegister ? 'Create your account to make your next cinema visit effortless.' : 'Sign in to access your reservations and digital movie passes.')}</p>

            <div className="kk-auth-tabs" role="tablist" aria-label="Sign-in method">
              <button className={`kk-auth-tab ${phoneTabActive ? 'active' : ''}`} id="tab-phone" role="tab" aria-selected={phoneTabActive} onClick={() => switchAuthTab('phone')} type="button">▯ &nbsp; Phone number</button>
              <button className={`kk-auth-tab ${!phoneTabActive ? 'active' : ''}`} id="tab-email" role="tab" aria-selected={!phoneTabActive} onClick={() => switchAuthTab('email')} type="button">✉ &nbsp; Email &amp; password</button>
            </div>

            {phoneTabActive ? (
              <div className="kk-auth-fields" role="tabpanel" aria-labelledby="tab-phone">
                <div>
                  <label className="kk-auth-label" htmlFor="mobile-input"><span>Registered mobile number</span><small>OTP sign-in</small></label>
                  <div className="kk-auth-inputwrap" style={mobileError ? { borderColor: '#C2305E', boxShadow: '0 0 0 3px rgba(194,48,94,.12)' } : undefined}>
                    <div className="kk-auth-prefix"><span aria-hidden="true">🇮🇳</span><span>+91</span></div>
                    <input className="kk-auth-field" id="mobile-input" maxLength={10} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" ref={mobileRef} type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile} aria-invalid={mobileError} />
                    <button className="kk-auth-iconbtn" onClick={() => mobileRef.current?.focus()} title="Focus mobile number" type="button" aria-label="Focus mobile number">⌗</button>
                  </div>
                  {mobileError && <p style={{ color: '#C2305E', fontSize: 11, margin: '7px 0 0' }}>Enter a valid 10-digit mobile number.</p>}
                </div>
                <label className="kk-auth-check">
                  <input checked={whatsappOptin} onChange={(e) => setWhatsappOptin(e.target.checked)} type="checkbox" />
                  <span><strong>Send booking confirmations over WhatsApp</strong><small>Receive movie passes and booking links through WhatsApp. You can change this preference anytime.</small></span>
                </label>
                <button className="kk-auth-primary" disabled={otpState !== 'idle'} onClick={triggerOtpDemo} type="button">
                  {otpState === 'sending' ? '◌  Sending OTP…' : otpState === 'sent' ? '✓  Demo OTP request complete' : <>Send login OTP <span aria-hidden="true">→</span></>}
                </button>
                <p style={{ fontSize: 10, color: '#84908a', lineHeight: 1.55, margin: '-4px 0 0' }}>Phone sign-in is shown as a UI demo in this screen.</p>
              </div>
            ) : (
              <form className="kk-auth-fields" onSubmit={submitCredentials} role="tabpanel" aria-labelledby="tab-email">
                {error && <div className="kk-auth-error" role="alert">{error}</div>}
                {isRegister && <div><label className="kk-auth-label" htmlFor="display-name-input">Full name</label><div className="kk-auth-inputwrap"><input className="kk-auth-field" id="display-name-input" onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" type="text" autoComplete="name" value={displayName} /></div></div>}
                <div><label className="kk-auth-label" htmlFor="email-input">Email address</label><div className="kk-auth-inputwrap"><input className="kk-auth-field" id="email-input" onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="email" required value={email} /></div></div>
                <div>
                  <div className="kk-auth-label"><label htmlFor="password-input">Password</label><button className="kk-auth-forgot" type="button" onClick={() => setError('Password reset is not configured on this screen. Please contact support.')}>Forgot password?</button></div>
                  <div className="kk-auth-inputwrap"><input className="kk-auth-field" id="password-input" onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} required value={password} /><button className="kk-auth-iconbtn" onClick={() => setShowPassword((v) => !v)} type="button" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? '◉' : '◎'}</button></div>
                </div>
                <button className="kk-auth-primary" disabled={submitting} type="submit">{submitting ? '◌  Please wait…' : isRegister ? 'Create account  →' : 'Sign in securely  →'}</button>
                <div className="kk-auth-switch"><button className="kk-auth-link" onClick={() => { setIsRegister((v) => !v); setError(''); }} type="button">{isRegister ? 'Already a member? Sign in' : 'New to Konkani Samudai? Create an account'}</button></div>
              </form>
            )}

            <div className="kk-auth-divider">OR CONTINUE WITH</div>
            <div className="kk-auth-socials">
              <button className="kk-auth-social" type="button" disabled title="Google sign-in is not connected"><span>{GOOGLE_ICON}</span> Google</button>
              <button className="kk-auth-social" type="button" disabled title="Apple sign-in is not connected"><span>{APPLE_ICON}</span> Apple ID</button>
            </div>
            <div className="kk-auth-guest"><Link to="/">Continue browsing as a guest&nbsp; →</Link></div>
            <div className="kk-auth-trust"><span><b>✓</b> Digital QR passes</span><span><b>◷</b> 8-minute seat hold</span><span><b>✦</b> Community screenings</span></div>
          </section>
        </div>
        <footer className="kk-auth-foot">
          <span>Konkani Samudai Theaters · Made for movie lovers</span>
          <nav className="kk-auth-foot-links" aria-label="Footer"><a href="#seat-policy">Seat policy</a><a href="#member-privileges">Member privileges</a><a href="mailto:support@konkanisamudai.example">Support</a></nav>
        </footer>
      </div>
    </main>
  );
}
