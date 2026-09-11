import { z } from "zod";

// At least 8 characters, at least one letter, at least one digit. Not a
// heavy policy, but a real step up from "any 8 characters" — used
// everywhere a password gets set (signup, account settings, reset) so the
// rule can't be accidentally weaker in one place than another.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must include at least one letter")
  .regex(/[0-9]/, "Password must include at least one number");
