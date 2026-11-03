import { z } from "zod";

export const emailField = z.string().trim().toLowerCase().email().max(254);
export const tokenField = z.string().min(20).max(128);
// Cap at 72 bytes: bcrypt silently truncates longer inputs.
export const newPasswordField = z.string().min(8).max(72);
