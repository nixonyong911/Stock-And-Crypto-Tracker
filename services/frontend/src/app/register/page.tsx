'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { registerUser } from './actions';

// Common country codes for phone numbers
const countryCodes = [
  { code: '+1', country: 'US/CA' },
  { code: '+44', country: 'UK' },
  { code: '+60', country: 'MY' },
  { code: '+65', country: 'SG' },
  { code: '+81', country: 'JP' },
  { code: '+82', country: 'KR' },
  { code: '+86', country: 'CN' },
  { code: '+91', country: 'IN' },
  { code: '+61', country: 'AU' },
  { code: '+49', country: 'DE' },
  { code: '+33', country: 'FR' },
  { code: '+39', country: 'IT' },
  { code: '+34', country: 'ES' },
  { code: '+55', country: 'BR' },
  { code: '+52', country: 'MX' },
  { code: '+7', country: 'RU' },
  { code: '+971', country: 'UAE' },
  { code: '+966', country: 'SA' },
  { code: '+62', country: 'ID' },
  { code: '+66', country: 'TH' },
  { code: '+84', country: 'VN' },
  { code: '+63', country: 'PH' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState('+60');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const fullPhoneNumber = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;

    const result = await registerUser({
      phone_number: fullPhoneNumber,
      telegram_username: telegramUsername || null,
      display_name: displayName,
    });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.successTitle}>Registration Complete!</h1>
            <p className={styles.successText}>
              Your account has been created. You can now use the Telegram bot to chat with our AI assistant.
            </p>
            <div className={styles.nextSteps}>
              <h3>Next Steps:</h3>
              <ol>
                <li>Open Telegram and search for <strong>@YourBotName</strong></li>
                <li>Type <code>/login</code> to start the authentication</li>
                <li>Enter your phone number when prompted</li>
                <li>Verify with the OTP sent to you</li>
              </ol>
            </div>
            <button 
              className={styles.backButton}
              onClick={() => router.push('/')}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.iconWrapper}>
              <span className={styles.telegramIcon}>📱</span>
            </div>
            <h1 className={styles.title}>Telegram Bot Registration</h1>
            <p className={styles.subtitle}>
              Register to access our AI-powered financial assistant via Telegram
            </p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && (
              <div className={styles.errorBanner}>
                <span className={styles.errorIcon}>⚠️</span>
                {error}
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label className={styles.label}>
                Phone Number <span className={styles.required}>*</span>
              </label>
              <div className={styles.phoneInput}>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className={styles.countrySelect}
                >
                  {countryCodes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.country})
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="123456789"
                  className={styles.phoneField}
                  required
                  pattern="[0-9]{6,15}"
                  title="Enter 6-15 digits"
                />
              </div>
              <span className={styles.hint}>Used for OTP verification via Telegram</span>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Display Name <span className={styles.required}>*</span></label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                className={styles.input}
                required
                minLength={2}
                maxLength={100}
              />
              <span className={styles.hint}>How you want to be addressed by the bot</span>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Telegram Username <span className={styles.optional}>(optional)</span></label>
              <div className={styles.usernameInput}>
                <span className={styles.atSymbol}>@</span>
                <input
                  type="text"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value.replace('@', ''))}
                  placeholder="username"
                  className={styles.usernameField}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_]{5,32}"
                  title="5-32 characters, letters, numbers, and underscores only"
                />
              </div>
              <span className={styles.hint}>Your Telegram @username (if you have one)</span>
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className={styles.spinner}></span>
                  Registering...
                </>
              ) : (
                <>
                  <span className={styles.buttonIcon}>🚀</span>
                  Register
                </>
              )}
            </button>
          </form>

          <div className={styles.footer}>
            <p>Already registered? Just open Telegram and type <code>/login</code></p>
          </div>
        </div>
      </div>
    </main>
  );
}
