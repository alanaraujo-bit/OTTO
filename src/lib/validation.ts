const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Informe seu e-mail.';
  if (!EMAIL.test(v)) return 'Esse e-mail não parece completo.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Informe sua senha.';
  if (value.length < 8) return 'Use pelo menos 8 caracteres.';
  return null;
}

export function validateName(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Como podemos te chamar?';
  if (v.length < 2) return 'Nome muito curto.';
  return null;
}

export interface Strength {
  /** 0–4 */
  score: number;
  label: string;
}

/**
 * Deliberately not a checklist of rules the user must satisfy — it reports what the password is
 * worth so the choice stays theirs.
 */
export function passwordStrength(value: string): Strength {
  if (!value) return { score: 0, label: '' };
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^\w\s]/.test(value)) score++;

  const labels = ['Fraca', 'Fraca', 'Razoável', 'Boa', 'Excelente'];
  return { score, label: labels[score] ?? 'Fraca' };
}
