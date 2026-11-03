import { z } from "zod";
import { emailField, newPasswordField, tokenField } from "@/lib/account/schemas";

export const signupSchema = z.object({
  token: tokenField,
  name: z.string().trim().min(1).max(60),
  email: emailField,
  password: newPasswordField,
  acceptTerms: z.literal(true),
});

export const joinSchema = z.object({ token: tokenField });

export const createInvitationSchema = z.object({
  note: z.string().trim().max(80).optional(),
});

export const groupNameField = z.string().trim().min(2).max(40);
