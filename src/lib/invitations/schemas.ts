import { z } from "zod";
import { emailField, newPasswordField, tokenField } from "@/lib/account/schemas";
import { isPlaceholderEmail } from "@/lib/auth/email";

const accountFields = {
  name: z.string().trim().min(1).max(60),
  email: emailField.refine((e) => !isPlaceholderEmail(e)),
  password: newPasswordField,
  acceptTerms: z.literal(true),
  // Honeypot: hidden in the form, only bots fill it in. Deliberately not a name browsers autofill.
  company_url: z.string().max(0).optional(),
};

export const signupSchema = z.object({ token: tokenField, ...accountFields });

export const openSignupSchema = z.object(accountFields);

export const joinSchema = z.object({ token: tokenField });

export const createInvitationSchema = z.object({
  note: z.string().trim().max(80).optional(),
});

export const groupNameField = z.string().trim().min(2).max(40);
