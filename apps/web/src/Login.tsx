import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, IS_DEMO, writeToken, type SessionUser } from './lib/api';

export function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    errorRef.current?.focus();
  }, [error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name || !password) return;
    setSending(true);
    setError(null);
    try {
      const result = await api.login(name, password);
      writeToken(result.accessToken);
      onLogin(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo entrar');
    } finally {
      setSending(false);
    }
  }

  function watchCaps(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState('CapsLock'));
  }

  return (
    <form className="card login" onSubmit={submit} aria-labelledby="login-titulo">
      <p className="login-kicker">Dirección de Salud · San Miguel de Tucumán</p>
      <h1 id="login-titulo">Ecolentes</h1>
      <p className="login-lead">Ingresá para seguir los pedidos de anteojos.</p>

      <div className="field">
        <label htmlFor="username">Usuario</label>
        <input
          ref={usernameRef}
          id="username"
          value={username}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={sending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <div className="password-field">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            autoComplete="current-password"
            disabled={sending}
            aria-invalid={error ? true : undefined}
            aria-describedby={capsLock ? 'caps-aviso' : error ? 'login-error' : undefined}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={watchCaps}
            onKeyUp={watchCaps}
            onBlur={() => setCapsLock(false)}
            required
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPassword}
            disabled={sending}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {capsLock && (
          <p id="caps-aviso" className="field-hint">
            Mayúsculas activadas.
          </p>
        )}
      </div>

      {error && (
        <p id="login-error" className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}

      {IS_DEMO && (
        <div className="ok-box">
          <p className="muted">
            Versión de demostración, con datos inventados. Entrá con la contraseña{' '}
            <strong>ecolentes</strong> y el usuario que quieras probar:
          </p>
          <div className="actions">
            {['operador', 'oftalmologo', 'optica', 'direccion', 'redes'].map((u) => (
              <button
                key={u}
                type="button"
                className="secondary"
                onClick={() => {
                  setUsername(u);
                  setPassword('ecolentes');
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="login-submit" type="submit" disabled={sending || !username.trim() || !password}>
        {sending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.6 10.7a3 3 0 0 0 4.2 4.2M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.1 4.1M6.1 6.1C3.7 7.9 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.4 4.1-1"
      />
    </svg>
  );
}
