// src/lib/schemas.ts
import { z } from 'zod';

// Define Zod schemas for validation

// Schema for basic settings stored in chrome.storage.sync
export const SettingsSchema = z.object({
  enabled: z.boolean().default(true),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  // Add more settings schemas here as needed
});

// Infer the TypeScript type from the schema
export type Settings = z.infer<typeof SettingsSchema>;

// Schema for messages between components
export const MessageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('getSettings') }),
  z.object({ action: z.literal('toggleEnabled') }), // Simpler toggle action
  z.object({ action: z.literal('setEnabled'), payload: z.object({ enabled: z.boolean() }) }),
  z.object({ action: z.literal('setTheme'), payload: z.object({ theme: SettingsSchema.shape.theme }) }),
  z.object({ action: z.literal('updateBodyClass'), payload: z.object({ enabled: z.boolean().optional() }) }), // Message from BG to CS
  z.object({ action: z.literal('queryInitialState') }), // Message from CS to BG
  // Add more message schemas
]);

export type Message = z.infer<typeof MessageSchema>;

// Utility function to safely parse messages
export function parseMessage(message: unknown): Message | null {
   try {
      return MessageSchema.parse(message);
   } catch (error) {
      if (error instanceof z.ZodError) {
         console.error("Invalid message format:", error.errors);
      } else {
         console.error("Error parsing message:", error);
      }
      return null;
   }
} 