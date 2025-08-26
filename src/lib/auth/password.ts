import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "crypto";

// Password policy constants
export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxRepeatedChars: 3,
  minPasswordAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  maxPasswordAge: 90 * 24 * 60 * 60 * 1000, // 90 days in milliseconds
} as const;

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: "weak" | "fair" | "good" | "strong";
  score: number; // 0-100
}

/**
 * Validate password against security policy
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  // Length validation
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long`);
  } else if (password.length >= PASSWORD_POLICY.minLength) {
    score += 20;
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`Password must not exceed ${PASSWORD_POLICY.maxLength} characters`);
  }

  // Character requirements
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  } else if (/[A-Z]/.test(password)) {
    score += 15;
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  } else if (/[a-z]/.test(password)) {
    score += 15;
  }

  if (PASSWORD_POLICY.requireNumbers && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  } else if (/\d/.test(password)) {
    score += 15;
  }

  if (PASSWORD_POLICY.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  } else if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 15;
  }

  // Advanced checks
  if (hasRepeatedCharacters(password, PASSWORD_POLICY.maxRepeatedChars)) {
    errors.push(`Password must not have more than ${PASSWORD_POLICY.maxRepeatedChars} repeated characters`);
  } else {
    score += 10;
  }

  // Check for common patterns
  if (hasCommonPatterns(password)) {
    errors.push("Password contains common patterns that are easy to guess");
  } else {
    score += 10;
  }

  // Determine strength
  let strength: PasswordValidationResult["strength"];
  if (score >= 90) strength = "strong";
  else if (score >= 70) strength = "good";
  else if (score >= 50) strength = "fair";
  else strength = "weak";

  return {
    isValid: errors.length === 0,
    errors,
    strength,
    score: Math.min(100, score),
  };
}

/**
 * Check for repeated characters
 */
function hasRepeatedCharacters(password: string, maxRepeated: number): boolean {
  let count = 1;
  for (let i = 1; i < password.length; i++) {
    if (password[i] === password[i - 1]) {
      count++;
      if (count > maxRepeated) {
        return true;
      }
    } else {
      count = 1;
    }
  }
  return false;
}

/**
 * Check for common patterns
 */
function hasCommonPatterns(password: string): boolean {
  const commonPatterns = [/123456/, /password/i, /admin/i, /qwerty/i, /abc123/i, /111111/, /000000/, /letmein/i, /welcome/i, /monkey/i];

  const sequentialPatterns = [/012345/, /123456/, /234567/, /345678/, /456789/, /567890/, /abcdef/i, /bcdefg/i, /cdefgh/i];

  const keyboardPatterns = [/qwerty/i, /asdfgh/i, /zxcvbn/i, /qwertyuiop/i, /asdfghjkl/i, /zxcvbnm/i];

  return [...commonPatterns, ...sequentialPatterns, ...keyboardPatterns].some((pattern) => pattern.test(password));
}

/**
 * Hash password using bcrypt with secure salt rounds
 */
export async function hashPassword(password: string): Promise<string> {
  // Validate password before hashing
  const validation = validatePassword(password);
  if (!validation.isValid) {
    throw new Error(`Password validation failed: ${validation.errors.join(", ")}`);
  }

  // Use 12 rounds for good security/performance balance
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash with timing attack protection
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // Always perform the hash comparison to prevent timing attacks
    const isValid = await bcrypt.compare(password, hash);

    // Additional timing attack protection
    const dummyHash = "$2b$12$dummyhashtopreventtimingattacks1234567890";
    if (!hash || hash.length < 10) {
      // Still perform a hash operation even with invalid hash
      await bcrypt.compare(password, dummyHash);
      return false;
    }

    return isValid;
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}

/**
 * Generate a cryptographically secure random password
 */
export function generateSecurePassword(length: number = 16): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  const allChars = uppercase + lowercase + numbers + symbols;

  let password = "";

  // Ensure at least one character from each category
  password += getRandomChar(uppercase);
  password += getRandomChar(lowercase);
  password += getRandomChar(numbers);
  password += getRandomChar(symbols);

  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += getRandomChar(allChars);
  }

  // Shuffle the password to avoid predictable patterns
  return shuffleString(password);
}

/**
 * Get a cryptographically secure random character from a string
 */
function getRandomChar(chars: string): string {
  const randomIndex = randomBytes(1)[0] % chars.length;
  return chars[randomIndex];
}

/**
 * Shuffle string characters using Fisher-Yates algorithm
 */
function shuffleString(str: string): string {
  const arr = str.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

/**
 * Check if password needs to be changed based on age
 */
export function isPasswordExpired(lastChanged: Date): boolean {
  const now = new Date();
  const age = now.getTime() - lastChanged.getTime();
  return age > PASSWORD_POLICY.maxPasswordAge;
}

/**
 * Check if password can be changed (not too recently changed)
 */
export function canChangePassword(lastChanged: Date): boolean {
  const now = new Date();
  const age = now.getTime() - lastChanged.getTime();
  return age > PASSWORD_POLICY.minPasswordAge;
}

/**
 * Generate a secure password reset token
 */
export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  return timingSafeEqual(bufferA, bufferB);
}
